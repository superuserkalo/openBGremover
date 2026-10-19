"""Bounded, static image compression and conversion.

libvips decodes, orients, colour-manages, and encodes JPEG (MozJPEG), PNG
(libpng), and WebP (libwebp). pillow-heif decodes HEIC, which libvips cannot.
Pillow encodes AVIF (libavif): libvips disables aom's intra block copy, which
makes AVIF text and graphics four to five times larger.
"""
import base64
import binascii
import io
import os
import struct
import time

# The container has one core, but libvips and libheif size their thread pools
# from the host's cores. One thread kept latency and lowered peak memory.
os.environ.setdefault("VIPS_CONCURRENCY", "1")

import pillow_heif  # noqa: E402
import pyvips  # noqa: E402
from PIL import Image  # noqa: E402

pyvips.cache_set_max(0)
pillow_heif.options.DECODE_THREADS = 1

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_OUTPUT_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 25_000_000
OUTPUT_FORMATS = {"jpeg", "jpg", "png", "webp", "avif"}
ENCODERS = {"jpeg": "mozjpeg", "png": "libpng", "webp": "libwebp", "avif": "libavif"}
HEIC_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"hevm", b"hevs"}
AVIF_BRANDS = {b"avif", b"avis"}


class OutputTooLarge(ValueError):
    pass


def save_bounded(image, saver, maximum, **options):
    """Encode through a libvips target that aborts once output passes maximum."""
    output = BoundedOutput(maximum)
    exceeded = False

    def write(chunk):
        nonlocal exceeded
        try:
            return output.write(chunk)
        except OutputTooLarge:
            exceeded = True
            return -1

    target = pyvips.TargetCustom()
    target.on_write(write)
    try:
        getattr(image, saver)(target, **options)
    except pyvips.Error:
        if exceeded:
            raise OutputTooLarge("Output exceeds the size limit") from None
        raise
    return output.getvalue()


class BoundedOutput(io.BytesIO):
    def __init__(self, maximum):
        super().__init__()
        self.maximum = maximum

    def write(self, value):
        if self.tell() + len(value) > self.maximum:
            raise OutputTooLarge("Output exceeds the size limit")
        return super().write(value)


def validate_options(operation, output_format, quality, lossless, compression_level):
    if operation not in {"compress-image", "convert-image"}:
        raise ValueError("Unsupported operation")
    if output_format not in OUTPUT_FORMATS:
        raise ValueError("Unsupported output format")
    if quality is not None and (type(quality) is not int or not 1 <= quality <= 100 or output_format == "png"):
        raise ValueError("Quality must be an integer from 1 to 100 for JPEG, WebP, or AVIF")
    if lossless is not None and (type(lossless) is not bool or output_format != "webp"):
        raise ValueError("Lossless is a WebP-only boolean option")
    if compression_level is not None and (type(compression_level) is not int or not 0 <= compression_level <= 9 or output_format != "png"):
        raise ValueError("Compression level must be an integer from 0 to 9 for PNG")


def source_format(raw):
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    if raw[4:8] == b"ftyp":
        # Major brand, then compatible brands after the 4-byte minor version.
        end = min(int.from_bytes(raw[:4], "big"), len(raw))
        brands = {raw[8:12]} | {raw[i:i + 4] for i in range(16, end - 3, 4)}
        if brands & AVIF_BRANDS:
            return "avif"
        if brands & HEIC_BRANDS:
            return "heic"
    raise ValueError("Only JPEG, PNG, WebP, HEIC, and AVIF inputs are supported")


def png_is_animated(raw):
    # libvips decodes only the first APNG frame; never drop the rest silently.
    offset = 8
    while offset + 8 <= len(raw):
        length, kind = struct.unpack(">I4s", raw[offset:offset + 8])
        if kind == b"acTL":
            return True
        if kind == b"IDAT":
            return False
        offset += 12 + length
    return False


def load_heic(raw):
    try:
        heif = pillow_heif.open_heif(raw, convert_hdr_to_8bit=True)
    except (ValueError, RuntimeError, OSError) as error:
        raise ValueError("Invalid HEIC image") from error
    if heif.mimetype == "image/heif-sequence":
        raise ValueError("Animated images are not supported by this operation")
    # The primary image is the photo viewers display. Gain maps, depth, and
    # thumbnails are auxiliary images and are never decoded.
    image = heif[heif.primary_index]
    width, height = image.size
    if width * height > MAX_PIXELS:
        raise ValueError("Image exceeds 25 megapixels")
    nclx = image.info.get("nclx_profile") or {}
    if nclx.get("transfer_characteristics") in {16, 18}:
        raise ValueError("HDR (PQ or HLG) HEIC images are not supported")
    bands = {"L": 1, "LA": 2, "La": 2, "RGB": 3, "RGBA": 4, "RGBa": 4}.get(image.mode)
    if bands is None:
        raise ValueError("Unsupported HEIC channel layout")
    # Wraps the decoded buffer without copying; pyvips keeps it alive.
    result = pyvips.Image.new_from_memory(image.data, width, height, bands, "uchar")
    result = result.copy(interpretation="srgb" if bands >= 3 else "b-w")
    if image.mode.endswith("a"):
        result = result.unpremultiply().cast("uchar")
    if icc := image.info.get("icc_profile"):
        result.set_type(pyvips.GValue.blob_type, "icc-profile-data", icc)
    elif nclx.get("color_primaries") == 12:
        result = result.icc_transform("srgb", input_profile="p3")
    # libheif has already applied the rotation and mirroring. Its EXIF still
    # holds the original orientation, so it must not reach autorot().
    return result, [width, height]


def load(raw, input_format):
    """Return the upright image and its stored dimensions."""
    if input_format == "heic":
        return load_heic(raw)
    if input_format == "png" and png_is_animated(raw):
        raise ValueError("Animated images are not supported by this operation")
    loader = {"jpeg": pyvips.Image.jpegload_buffer, "png": pyvips.Image.pngload_buffer,
              "webp": pyvips.Image.webpload_buffer, "avif": pyvips.Image.heifload_buffer}[input_format]
    # Loading reads the header only; pixels decode on first use.
    image = loader(raw, fail_on="error")
    if image.width * image.height > MAX_PIXELS:
        raise ValueError("Image exceeds 25 megapixels")
    if image.get_typeof("n-pages") and image.get("n-pages") > 1:
        raise ValueError("Animated images are not supported by this operation")
    if image.format != "uchar" and input_format != "avif":
        raise ValueError("Only 8-bit image channels are supported")
    return image.autorot(), [image.width, image.height]


def to_srgb(image):
    """Return 8-bit sRGB or sRGB + alpha. RGB ICC profiles are kept as-is."""
    interpretation = image.interpretation
    icc = image.get_typeof("icc-profile-data") != 0
    if interpretation == "cmyk" or (icc and image.bands in {1, 2}):
        # The built-in CMYK profile stands in when a CMYK image carries none.
        try:
            image = image.icc_transform("srgb", embedded=True, input_profile="cmyk" if interpretation == "cmyk" else "srgb")
        except pyvips.Error as error:
            raise ValueError("Invalid color profile") from error
    elif image.format != "uchar" or image.bands in {1, 2}:
        image = image.colourspace("srgb")
    if image.format != "uchar":
        image = image.cast("uchar")
    return image


def encode(image, output_format, quality, lossless, compression_level, maximum):
    if output_format == "jpeg":
        if image.hasalpha():
            image = image.flatten(background=[255, 255, 255])
        # MozJPEG with trellis quantisation, deringing, scan optimisation, and
        # the ImageMagick quant table, as Squoosh uses it. 4:2:0 is explicit
        # because libvips would switch subsampling off at quality 90 and above.
        return save_bounded(image, "jpegsave_target", maximum, Q=quality, keep="icc", subsample_mode="on",
                            interlace=True, optimize_coding=True, trellis_quant=True,
                            overshoot_deringing=True, optimize_scans=True, quant_table=3)
    if output_format == "png":
        # libvips' default row filter is none, which makes photos much larger.
        return save_bounded(image, "pngsave_target", maximum, compression=compression_level, filter="all", keep="icc")
    if output_format == "webp":
        return save_bounded(image, "webpsave_target", maximum, Q=quality, lossless=lossless, effort=4, exact=True, keep="icc")
    mode = "RGBA" if image.hasalpha() else "RGB"
    pillow = Image.frombuffer(mode, (image.width, image.height), image.write_to_memory(), "raw", mode, 0, 1)
    options = {"quality": quality, "speed": 6, "subsampling": "4:2:0"}
    if image.get_typeof("icc-profile-data"):
        options["icc_profile"] = image.get("icc-profile-data")
    output = BoundedOutput(maximum)
    pillow.save(output, "AVIF", **options)
    return output.getvalue()


def transform_image(image_data, operation, format, quality=None, lossless=None, compression_level=None):
    started = time.monotonic()
    validate_options(operation, format, quality, lossless, compression_level)
    output_format = "jpeg" if format == "jpg" else format
    if not isinstance(image_data, str) or len(image_data) > ((MAX_UPLOAD_BYTES + 2) // 3) * 4:
        raise ValueError("Image exceeds 10 MiB")
    try:
        raw = base64.b64decode(image_data, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Invalid base64 image") from error
    if not raw or len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError("Image exceeds 10 MiB or is empty")

    input_format = source_format(raw)
    if operation == "compress-image" and output_format != input_format:
        raise ValueError("Compression must keep the source format")

    options = {
        "quality": (60 if output_format == "avif" else 80) if quality is None else quality,
        "lossless": False if lossless is None else lossless,
        "compression_level": 6 if compression_level is None else compression_level,
    }
    # Compression never makes a file larger. Stop encoding early if it cannot win.
    maximum = len(raw) if operation == "compress-image" else MAX_OUTPUT_BYTES
    try:
        image, original_size = load(raw, input_format)
        image = to_srgb(image)
        encoded = encode(image, output_format, maximum=maximum, **options)
    except OutputTooLarge:
        if operation != "compress-image":
            raise
        encoded = raw
    except pyvips.Error as error:
        raise ValueError("Invalid image") from error
    retained = operation == "compress-image" and len(encoded) >= len(raw)
    if retained:
        encoded = raw

    metadata = {
        "operation": operation, "format": output_format,
        "original_size": original_size,
        "output_size": original_size if retained else [image.width, image.height],
        "input_bytes": len(raw), "output_bytes": len(encoded),
        "bytes_saved": len(raw) - len(encoded), "retained_original": retained,
        "processing_time_ms": round((time.monotonic() - started) * 1000),
        "device": "cpu", "is_animated": False, "frame_count": 1,
    }
    # These describe the encoder only when its output was selected.
    if not retained:
        metadata["encoder"] = ENCODERS[output_format]
        if output_format == "png":
            metadata["compression_level"] = options["compression_level"]
        else:
            metadata["quality_used"] = str(options["quality"])
        if output_format == "webp":
            metadata["lossless"] = options["lossless"]
    return encoded, metadata
