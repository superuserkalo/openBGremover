"""Image decoding and encoding, independent of Beam and the model runtime."""
import base64
import io
import time
from collections.abc import Callable

import imagecodecs
import numpy as np
from PIL import Image, ImageChops, ImageOps, ImageSequence

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 25_000_000
MAX_FRAMES = 60
MAX_ANIMATION_PIXELS = 60_000_000
MAX_BINARY_RESULT_BYTES = 12 * 1024 * 1024
FORMATS = {"png", "webp", "gif", "jpg", "jpeg"}


def output_size(size: tuple[int, int], resize: dict | None) -> tuple[int, int]:
    if not resize:
        return size
    width, height = resize.get("width"), resize.get("height")
    for value in (width, height, resize.get("max_width"), resize.get("max_height")):
        if value is not None and (type(value) is not int or not 1 <= value <= 8192):
            raise ValueError("Resize dimensions must be integers from 1 to 8192")
    if (width is None) != (height is None):
        raise ValueError("Provide width and height together")
    if width is not None and height is not None:
        if not resize.get("keep_aspect", True):
            return width, height
        scale = min(width / size[0], height / size[1])
    else:
        scale = min(1, resize.get("max_width", size[0]) / size[0], resize.get("max_height", size[1]) / size[1])
    return max(1, round(size[0] * scale)), max(1, round(size[1] * scale))


def encode(image: Image.Image, output_format: str, fast_png: bool = False) -> bytes:
    buffer = io.BytesIO()
    if output_format in {"jpg", "jpeg"}:
        background = Image.new("RGB", image.size, "white")
        background.paste(image, mask=image.getchannel("A"))
        background.save(buffer, "JPEG", quality=95)
    elif output_format == "png" and fast_png and not any(key in image.info for key in ("icc_profile", "exif", "transparency")):
        # UP filtering and compression level 3 preserve every RGBA sample while
        # avoiding Pillow's adaptive filter search. Keep the original encoder
        # as a size fallback so a faster encoding cannot reject a fitting image.
        result = imagecodecs.png_encode(np.asarray(image), level=3, filter=imagecodecs.PNG.FILTER.UP)
        if len(result) <= MAX_BINARY_RESULT_BYTES:
            return result
        image.save(buffer, "PNG", compress_level=6)
    else:
        image.save(buffer, output_format.upper())
    return buffer.getvalue()


def process_image(encoded: str, infer_mask: Callable[[Image.Image], Image.Image],
                  output_format: str = "png", resize: dict | None = None,
                  return_mask: bool = False, binary: bool = False,
                  record_timing: Callable[[str, int], None] | None = None) -> dict:
    started = time.monotonic()
    if output_format not in FORMATS:
        raise ValueError("Unsupported output format")
    if len(encoded) > (MAX_UPLOAD_BYTES + 2) // 3 * 4:
        raise ValueError("Image exceeds 10 MB")
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError("Image exceeds 10 MB")
    image = Image.open(io.BytesIO(raw))
    if image.format not in {"PNG", "JPEG", "WEBP", "GIF"}:
        raise ValueError("Unsupported input format")
    frames = getattr(image, "n_frames", 1)
    animated = frames > 1
    pixels = image.width * image.height
    if pixels > MAX_PIXELS or frames > MAX_FRAMES or (animated and pixels * frames > MAX_ANIMATION_PIXELS):
        raise ValueError("Image exceeds pixel or animation limits")

    if not animated:
        image = ImageOps.exif_transpose(image)
    original_size = image.size
    target = output_size(original_size, resize)
    if target[0] * target[1] > MAX_PIXELS or (animated and target[0] * target[1] * frames > MAX_ANIMATION_PIXELS):
        raise ValueError("Output exceeds pixel or animation limits")
    if record_timing:
        record_timing("image_decode", round((time.monotonic() - started) * 1000))
    results = []
    durations = []
    mask = None
    for frame in ImageSequence.Iterator(image):
        rgba = frame.convert("RGBA")
        mask = infer_mask(frame if frame.mode == "RGB" else rgba.convert("RGB")).convert("L")
        if mask.size != rgba.size:
            mask = mask.resize(rgba.size, Image.Resampling.LANCZOS)
        # Existing transparent pixels must never become opaque again.
        mask = ImageChops.multiply(mask, rgba.getchannel("A"))
        rgba.putalpha(mask)
        results.append(rgba if target == rgba.size else rgba.resize(target, Image.Resampling.LANCZOS))
        durations.append(frame.info.get("duration", 100))

    encoding_started = time.monotonic()
    if animated:
        # Preserve the previous API's animated-input behavior: an animated GIF result.
        output_format = "gif"
        buffer = io.BytesIO()
        results[0].save(buffer, "GIF", save_all=True, append_images=results[1:],
                        duration=durations, loop=image.info.get("loop", 0), disposal=2)
        result = buffer.getvalue()
    else:
        result = encode(results[0], output_format, fast_png=binary)

    if record_timing:
        record_timing("image_encode", round((time.monotonic() - encoding_started) * 1000))

    response = {"success": True, "image": result if binary else base64.b64encode(result).decode("ascii"), "metadata": {
        "original_size": list(original_size), "output_size": list(target),
        "format": output_format, "is_animated": animated, "frame_count": frames,
    }}
    if return_mask and not animated and mask is not None:
        mask_bytes = encode(mask if target == mask.size else mask.resize(target, Image.Resampling.LANCZOS), "png")
        response["mask"] = mask_bytes if binary else base64.b64encode(mask_bytes).decode("ascii")
    return response
