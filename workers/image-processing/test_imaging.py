import base64
import io
import random
import struct
import unittest
import zlib

import pillow_heif
from PIL import Image, ImageCms, ImageOps

from imaging import MAX_OUTPUT_BYTES, OutputTooLarge, transform_image


def encoded(image, format="PNG", **options):
    output = io.BytesIO()
    image.save(output, format, **options)
    return base64.b64encode(output.getvalue()).decode()


class ImageTransformTests(unittest.TestCase):
    def setUp(self):
        self.image = Image.frombytes("RGB", (128, 96), random.Random(42).randbytes(128 * 96 * 3))
        self.png = encoded(self.image)

    def test_each_input_converts_to_each_output_with_correct_metadata(self):
        for source in ("JPEG", "PNG", "WEBP"):
            value = encoded(self.image, source)
            for target in ("jpeg", "png", "webp"):
                with self.subTest(source=source, target=target):
                    data, meta = transform_image(value, "convert-image", target)
                    result = Image.open(io.BytesIO(data))
                    result.load()
                    self.assertEqual(result.format.lower(), target)
                    self.assertEqual(result.size, self.image.size)
                    self.assertEqual(meta["input_bytes"], len(base64.b64decode(value)))
                    self.assertEqual(meta["output_bytes"], len(data))
                    self.assertEqual(meta["bytes_saved"], meta["input_bytes"] - len(data))
                    self.assertFalse(meta["retained_original"])

    def test_server_defaults_and_explicit_overrides(self):
        for target, defaults in [("jpeg", {"quality": 80}), ("png", {"compression_level": 6}),
                                 ("webp", {"quality": 80, "lossless": False})]:
            implicit, _ = transform_image(self.png, "convert-image", target)
            explicit, _ = transform_image(self.png, "convert-image", target, **defaults)
            self.assertEqual(implicit, explicit)
        for options in [{"quality": 1, "lossless": True}, {"quality": 100, "lossless": False}]:
            _, meta = transform_image(self.png, "convert-image", "webp", **options)
            self.assertEqual(meta["quality_used"], str(options["quality"]))
            self.assertEqual(meta["lossless"], options["lossless"])
        _, meta = transform_image(self.png, "convert-image", "png", compression_level=0)
        self.assertEqual(meta["compression_level"], 0)

    def test_compression_never_grows_and_retains_source_format(self):
        for source in ("JPEG", "PNG", "WEBP"):
            value = encoded(self.image, source)
            data, meta = transform_image(value, "compress-image", source.lower())
            self.assertLessEqual(len(data), len(base64.b64decode(value)))
            self.assertEqual(Image.open(io.BytesIO(data)).format, source)
            self.assertGreaterEqual(meta["bytes_saved"], 0)
        tiny = encoded(Image.new("RGB", (1, 1), "white"), optimize=True)
        data, meta = transform_image(tiny, "compress-image", "png", compression_level=0)
        self.assertEqual(data, base64.b64decode(tiny))
        self.assertTrue(meta["retained_original"])
        self.assertNotIn("compression_level", meta)

    def test_lower_jpeg_quality_reduces_size_and_jpg_alias_is_normalized(self):
        small, _ = transform_image(self.png, "convert-image", "jpg", quality=20)
        large, meta = transform_image(self.png, "convert-image", "jpeg", quality=95)
        self.assertLess(len(small), len(large))
        self.assertEqual(meta["format"], "jpeg")
        self.assertEqual(meta["quality_used"], "95")

    def test_lossless_outputs_preserve_soft_alpha_and_hidden_rgb(self):
        rgba = Image.frombytes("RGBA", (32, 32), random.Random(2).randbytes(32 * 32 * 4))
        rgba.putpixel((0, 0), (255, 33, 85, 0))
        value = encoded(rgba)
        for target, options in [("png", {}), ("webp", {"lossless": True})]:
            result, _ = transform_image(value, "convert-image", target, **options)
            actual = Image.open(io.BytesIO(result)).convert("RGBA")
            self.assertEqual(actual.tobytes(), rgba.tobytes())

    def test_palette_transparency_and_jpeg_white_background(self):
        palette = Image.new("P", (64, 64), 0)
        palette.putpalette([255, 0, 0, 0, 0, 255] + [0] * 762)
        palette.info["transparency"] = 0
        value = encoded(palette)
        transparent, _ = transform_image(value, "convert-image", "webp", lossless=True)
        self.assertEqual(Image.open(io.BytesIO(transparent)).convert("RGBA").getpixel((32, 32))[3], 0)
        flattened, _ = transform_image(value, "convert-image", "jpeg")
        self.assertEqual(Image.open(io.BytesIO(flattened)).getpixel((32, 32)), (255, 255, 255))

    def test_orientation_is_applied_and_color_profile_preserved(self):
        exif = Image.Exif()
        exif[274] = 6
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        value = encoded(self.image, "JPEG", exif=exif, icc_profile=profile)
        result, meta = transform_image(value, "convert-image", "png")
        image = Image.open(io.BytesIO(result))
        reference = ImageOps.exif_transpose(Image.open(io.BytesIO(base64.b64decode(value))))
        self.assertEqual(image.size, (96, 128))
        self.assertEqual(image.tobytes(), reference.tobytes())
        self.assertEqual(image.info["icc_profile"], profile)
        self.assertNotIn(274, image.getexif())
        self.assertEqual(meta["original_size"], [128, 96])

    def test_animation_is_rejected_instead_of_silently_dropping_frames(self):
        for format in ("PNG", "WEBP"):
            value = encoded(self.image, format, save_all=True, append_images=[Image.new("RGB", self.image.size, "red")], duration=100)
            with self.assertRaisesRegex(ValueError, "Animated"):
                transform_image(value, "convert-image", "png")

    def test_rejects_unsupported_formats_bit_depth_and_invalid_options(self):
        for value in (encoded(self.image, "GIF"), encoded(Image.new("I;16", (2, 2)))):
            with self.assertRaises(ValueError):
                transform_image(value, "convert-image", "png")
        for options in ({"quality": 0}, {"quality": True}, {"quality": 1.5}, {"quality": 101}, {"lossless": True}, {"compression_level": 3}):
            with self.assertRaises(ValueError):
                transform_image(self.png, "convert-image", "jpeg", **options)
        with self.assertRaises(ValueError):
            transform_image(self.png, "compress-image", "jpeg")
        with self.assertRaises(ValueError):
            transform_image(self.png, "convert-image", "png", quality=80)

    def test_rejects_bad_base64_truncation_and_upload_size(self):
        for value in ("!bad", base64.b64encode(b"\x89PNG\r\n\x1a\n").decode(), "A" * (14 * 1024 * 1024)):
            with self.assertRaises((ValueError, OSError)):
                transform_image(value, "convert-image", "png")

    def test_pixel_limit_is_checked_before_decompressing_pixels(self):
        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        header = struct.pack(">IIBBBBB", 5001, 5000, 8, 2, 0, 0, 0)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", b"") + chunk(b"IEND", b"")
        with self.assertRaisesRegex(ValueError, "25 megapixels"):
            transform_image(base64.b64encode(png).decode(), "convert-image", "png")

    def test_conversion_stops_when_output_exceeds_limit(self):
        # A valid compressed JPEG can expand beyond the result limit as lossless PNG.
        image = Image.frombytes("RGB", (3000, 2000), random.Random(17).randbytes(3000 * 2000 * 3))
        value = encoded(image, "JPEG", quality=85)
        self.assertLess(len(base64.b64decode(value)), 10 * 1024 * 1024)
        with self.assertRaises(OutputTooLarge):
            transform_image(value, "convert-image", "png", compression_level=0)
        data, _ = transform_image(value, "compress-image", "jpeg", quality=100)
        self.assertLessEqual(len(data), len(base64.b64decode(value)))
        self.assertLess(len(data), MAX_OUTPUT_BYTES)


    def test_heic_input_is_upright_once_with_its_profile_and_alpha(self):
        exif = Image.Exif()
        exif[274] = 6
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        heif = pillow_heif.from_pillow(self.image)
        output = io.BytesIO()
        heif.save(output, quality=-1, exif=exif.tobytes(), icc_profile=profile)
        value = base64.b64encode(output.getvalue()).decode()
        result, meta = transform_image(value, "convert-image", "png")
        image = Image.open(io.BytesIO(result))
        # libheif applies the stored rotation; applying EXIF again would undo it.
        self.assertEqual(image.size, (96, 128))
        self.assertEqual(image.info["icc_profile"], profile)
        self.assertEqual(meta["original_size"], [96, 128])
        rgba = Image.new("RGBA", (16, 16), (10, 200, 30, 0))
        rgba.paste((10, 200, 30, 128), (0, 0, 8, 16))
        output = io.BytesIO()
        pillow_heif.from_pillow(rgba).save(output, quality=-1)
        result, _ = transform_image(base64.b64encode(output.getvalue()).decode(), "convert-image", "webp", lossless=True)
        alpha = Image.open(io.BytesIO(result)).getchannel("A")
        self.assertEqual(alpha.getextrema(), (0, 128))
        with self.assertRaisesRegex(ValueError, "source format"):
            transform_image(value, "compress-image", "jpeg")

    def test_heic_pixel_limit_is_checked_before_decoding(self):
        output = io.BytesIO()
        pillow_heif.from_pillow(Image.new("RGB", (5008, 5008))).save(output, quality=10)
        with self.assertRaisesRegex(ValueError, "25 megapixels"):
            transform_image(base64.b64encode(output.getvalue()).decode(), "convert-image", "jpeg")

    def test_avif_output_and_input_with_alpha_quality_and_encoder(self):
        rgba = self.image.convert("RGBA")
        rgba.putalpha(Image.linear_gradient("L").resize(rgba.size))
        value = encoded(rgba)
        small, meta = transform_image(value, "convert-image", "avif", quality=20)
        large, _ = transform_image(value, "convert-image", "avif", quality=90)
        implicit, _ = transform_image(value, "convert-image", "avif")
        explicit, _ = transform_image(value, "convert-image", "avif", quality=60)
        self.assertLess(len(small), len(large))
        self.assertEqual(implicit, explicit)
        self.assertEqual((meta["encoder"], meta["quality_used"]), ("libavif", "20"))
        image = Image.open(io.BytesIO(large))
        self.assertEqual((image.format, image.mode), ("AVIF", "RGBA"))
        avif = base64.b64encode(large).decode()
        data, meta = transform_image(avif, "compress-image", "avif", quality=30)
        self.assertLessEqual(len(data), len(large))
        result, _ = transform_image(avif, "convert-image", "png")
        self.assertEqual(Image.open(io.BytesIO(result)).mode, "RGBA")

    def test_reports_encoders_and_never_writes_exif(self):
        exif = Image.Exif()
        exif[271] = "camera"
        value = encoded(self.image, "JPEG", exif=exif)
        for target, encoder in [("jpeg", "mozjpeg"), ("png", "libpng"), ("webp", "libwebp")]:
            with self.subTest(target=target):
                result, meta = transform_image(value, "convert-image", target)
                self.assertEqual(meta["encoder"], encoder)
                self.assertNotIn("exif", Image.open(io.BytesIO(result)).info)

    def test_jpeg_keeps_420_subsampling_at_high_quality(self):
        result, _ = transform_image(self.png, "convert-image", "jpeg", quality=95)
        from PIL import JpegImagePlugin
        self.assertEqual(JpegImagePlugin.get_sampling(Image.open(io.BytesIO(result))), 2)

    def test_cmyk_jpeg_converts_to_rgb(self):
        value = encoded(Image.new("CMYK", (8, 8), (0, 255, 255, 0)), "JPEG", quality=95)
        result, _ = transform_image(value, "convert-image", "png")
        image = Image.open(io.BytesIO(result))
        self.assertEqual(image.mode, "RGB")
        red, green, blue = image.getpixel((4, 4))
        self.assertGreater(red, 180)
        self.assertLess(max(green, blue), 80)


if __name__ == "__main__":
    unittest.main()
