"""Bounded, static image compression and conversion using Pillow only."""
import base64
import binascii
import io
import time

from PIL import Image, ImageCms, ImageOps

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_OUTPUT_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 25_000_000
FORMATS = {"JPEG": "jpeg", "PNG": "png", "WEBP": "webp"}


class OutputTooLarge(ValueError):
    pass


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
    if output_format not in {"jpeg", "jpg", "png", "webp"}:
        raise ValueError("Unsupported output format")
    if quality is not None and (type(quality) is not int or not 1 <= quality <= 100 or output_format == "png"):
        raise ValueError("Quality must be an integer from 1 to 100 for JPEG or WebP")
    if lossless is not None and (type(lossless) is not bool or output_format != "webp"):
        raise ValueError("Lossless is a WebP-only boolean option")
    if compression_level is not None and (type(compression_level) is not int or not 0 <= compression_level <= 9 or output_format != "png"):
        raise ValueError("Compression level must be an integer from 0 to 9 for PNG")


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

    with Image.open(io.BytesIO(raw)) as source:
        source_format = FORMATS.get(source.format)
        if source_format is None:
            raise ValueError("Only JPEG, PNG, and WebP inputs are supported")
        if source.width * source.height > MAX_PIXELS:
            raise ValueError("Image exceeds 25 megapixels")
        if getattr(source, "n_frames", 1) != 1:
            raise ValueError("Animated images are not supported by this operation")
        if source.mode not in {"1", "L", "LA", "P", "RGB", "RGBA", "CMYK"}:
            raise ValueError("Only 8-bit image channels are supported")
        if operation == "compress-image" and output_format != source_format:
            raise ValueError("Compression must keep the source format")
        original_size = source.size
        source.load()
        image = ImageOps.exif_transpose(source)

    icc = image.info.get("icc_profile")
    if image.mode in {"CMYK", "1", "L", "LA"} and icc:
        try:
            alpha = image.getchannel("A") if image.mode == "LA" else None
            profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
            managed = image.convert("L") if image.mode in {"1", "LA"} else image
            image = ImageCms.profileToProfile(managed, profile, srgb, outputMode="RGB")
            if alpha is not None:
                image.putalpha(alpha)
            icc = srgb.tobytes()
        except (ImageCms.PyCMSError, OSError, ValueError) as error:
            raise ValueError("Invalid color profile") from error
    image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
    if output_format == "jpeg" and image.mode == "RGBA":
        background = Image.new("RGB", image.size, "white")
        background.paste(image, mask=image.getchannel("A"))
        image = background
    image.info.clear()

    options = {}
    if icc:
        options["icc_profile"] = icc
    if output_format == "jpeg":
        options.update(quality=80 if quality is None else quality, subsampling=2, optimize=True)
    elif output_format == "png":
        options["compress_level"] = 6 if compression_level is None else compression_level
    else:
        options.update(quality=80 if quality is None else quality, lossless=False if lossless is None else lossless, method=4, exact=True)

    retained = False
    # Compression never makes a file larger. Stop encoding early if it cannot win.
    maximum = len(raw) if operation == "compress-image" else MAX_OUTPUT_BYTES
    try:
        output = BoundedOutput(maximum)
        image.save(output, output_format.upper(), **options)
        encoded = output.getvalue()
        if operation == "compress-image" and len(encoded) >= len(raw):
            encoded, retained = raw, True
    except OutputTooLarge:
        if operation != "compress-image":
            raise
        encoded, retained = raw, True

    metadata = {
        "operation": operation, "format": output_format,
        "original_size": list(original_size),
        "output_size": list(original_size if retained else image.size),
        "input_bytes": len(raw), "output_bytes": len(encoded),
        "bytes_saved": len(raw) - len(encoded), "retained_original": retained,
        "processing_time_ms": round((time.monotonic() - started) * 1000),
        "device": "cpu", "is_animated": False, "frame_count": 1,
    }
    # These describe the encoder only when its output was selected.
    if not retained:
        if output_format == "png":
            metadata["compression_level"] = options["compress_level"]
        else:
            metadata["quality_used"] = str(options["quality"])
        if output_format == "webp":
            metadata["lossless"] = options["lossless"]
    return encoded, metadata
