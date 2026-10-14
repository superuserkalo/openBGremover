import base64
import io
import unittest
from PIL import Image
from imaging import process_image, output_size


def encoded(image, format="PNG", **options):
    buffer = io.BytesIO()
    image.save(buffer, format, **options)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def decoded(value):
    return Image.open(io.BytesIO(base64.b64decode(value)))


def soft_mask(image):
    return Image.new("L", image.size, 128)


class ImagePipelineTests(unittest.TestCase):
    def test_binary_transport_preserves_pixels_alpha_and_dimensions(self):
        image = Image.new("RGBA", (2048, 1536), (18, 92, 203, 191))
        source = encoded(image)
        for format in ["png", "webp", "gif", "jpg"]:
            with self.subTest(format=format):
                legacy = process_image(source, soft_mask, format, return_mask=True)
                binary = process_image(source, soft_mask, format, return_mask=True, binary=True)
                old_image = decoded(legacy["image"])
                new_image = Image.open(io.BytesIO(binary["image"]))
                self.assertEqual(new_image.mode, old_image.mode)
                self.assertEqual(new_image.tobytes(), old_image.tobytes())
                self.assertEqual(binary["mask"], base64.b64decode(legacy["mask"]))
                self.assertEqual(Image.open(io.BytesIO(binary["image"])).size, image.size)
        self.assertEqual(Image.open(io.BytesIO(binary["mask"])).getextrema(), (95, 95))

    def test_exif_rotation_and_source_pixels_are_preserved(self):
        image = Image.new("RGB", (7, 3), (19, 87, 211))
        exif = Image.Exif()
        exif[274] = 6
        source = encoded(image, "JPEG", exif=exif)
        expected = decoded(source).getpixel((0, 0))
        result = process_image(source, soft_mask, binary=True)
        output = Image.open(io.BytesIO(result["image"]))
        self.assertEqual(output.size, (3, 7))
        self.assertEqual(output.getpixel((0, 0)), (*expected, 128))

    def test_preserves_soft_alpha_and_existing_transparency(self):
        image = Image.new("RGBA", (2, 1), (255, 0, 0, 255))
        image.putpixel((0, 0), (255, 0, 0, 0))
        result = process_image(encoded(image), soft_mask, return_mask=True)
        alpha = decoded(result["image"]).getchannel("A")
        self.assertEqual(list(alpha.get_flattened_data()), [0, 128])
        self.assertEqual(list(decoded(result["mask"]).get_flattened_data()), [0, 128])

    def test_bounds_resizing_and_preserves_aspect_ratio(self):
        result = process_image(encoded(Image.new("RGB", (200, 100))), soft_mask,
                               resize={"max_width": 50, "max_height": 50})
        self.assertEqual(decoded(result["image"]).size, (50, 25))
        self.assertEqual(output_size((200, 100), {"width": 40, "height": 40, "keep_aspect": False}), (40, 40))
        self.assertEqual(output_size((200, 100), {"max_width": 1000}), (200, 100))
        with self.assertRaises(ValueError):
            output_size((10, 10), {"width": -1, "height": 100})

    def test_requested_formats_match_encoded_bytes(self):
        image = encoded(Image.new("RGB", (10, 10), "red"))
        for format, expected in [("png", "PNG"), ("webp", "WEBP"), ("gif", "GIF"), ("jpg", "JPEG"), ("jpeg", "JPEG")]:
            with self.subTest(format=format):
                result = process_image(image, soft_mask, format)
                self.assertEqual(decoded(result["image"]).format, expected)

    def test_animation_retains_frames_duration_and_resize(self):
        frames = [Image.new("RGBA", (20, 10), color) for color in ["red", "blue"]]
        source = encoded(frames[0], "GIF", save_all=True, append_images=frames[1:], duration=[100, 200], loop=2)
        result = process_image(source, soft_mask, resize={"max_width": 10})
        image = decoded(result["image"])
        self.assertEqual(image.n_frames, 2)
        self.assertEqual(image.size, (10, 5))
        self.assertEqual(image.info["loop"], 2)
        self.assertEqual(image.info["duration"], 100)
        image.seek(1)
        self.assertEqual(image.info["duration"], 200)
        self.assertEqual(result["metadata"]["format"], "gif")

    def test_rejects_invalid_data_before_inference(self):
        def unexpected_inference(image):
            self.fail("Invalid input reached inference")
        for value in ["invalid!", base64.b64encode(b"not an image").decode("ascii")]:
            with self.assertRaises((ValueError, OSError)):
                process_image(value, unexpected_inference)


if __name__ == "__main__":
    unittest.main()
