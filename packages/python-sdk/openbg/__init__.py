"""Server-side client for openBGremover. Processing requests are never retried."""
from base64 import b64encode, b64decode
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
import json
import math

__all__ = ["OpenBG", "OpenBGError", "ImageResult", "ImageTransformResult", "ImageTransformMetadata", "ResizeOptions"]

ImageFormat = Literal["png", "webp", "gif", "jpg", "jpeg"]
StillImageFormat = Literal["png", "webp", "jpg", "jpeg", "avif"]
Quality = Literal["auto", "quality", "portrait", "product", "speed"]


class ResizeOptions(TypedDict, total=False):
    width: float
    height: float
    max_width: float
    max_height: float
    keep_aspect: bool


class OpenBGError(Exception):
    def __init__(self, message: str, status: int = 0, code: str = "API_ERROR"):
        super().__init__(message)
        self.status = status
        self.code = code


class _NoRedirect(HTTPRedirectHandler):
    # Keep credentials and paid requests on the configured endpoint.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class ImageResult:
    image: bytes
    processing_time_ms: float
    format: str | None
    mask: bytes | None = None

    def save(self, path: str | Path) -> None:
        Path(path).write_bytes(self.image)


@dataclass(frozen=True)
class ImageTransformMetadata:
    operation: Literal["compress-image", "convert-image"]
    format: StillImageFormat
    original_size: tuple[int, int]
    output_size: tuple[int, int]
    input_bytes: int
    output_bytes: int
    bytes_saved: int
    retained_original: bool
    quality_used: str | None = None
    lossless: bool | None = None
    compression_level: int | None = None
    encoder: str | None = None


@dataclass(frozen=True, kw_only=True)
class ImageTransformResult(ImageResult):
    metadata: ImageTransformMetadata


def _decode_result(payload: bytes) -> ImageResult:
    try:
        data = json.loads(payload)
        if not isinstance(data, dict) or data.get("success") is not True:
            raise ValueError("Expected successful response")
        metadata = data["metadata"]
        if not isinstance(metadata, dict):
            raise ValueError("Expected metadata")
        duration = data["processing_time_ms"]
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration):
            raise ValueError("Invalid processing time")
        image = data["result_image"]
        mask = data.get("mask_image")
        if not isinstance(image, str) or not image or (mask is not None and not isinstance(mask, str)):
            raise ValueError("Invalid image data")
        image_format = metadata.get("format")
        if image_format is not None and image_format not in ("png", "webp", "gif", "jpg", "jpeg", "avif"):
            raise ValueError("Invalid image format")
        return ImageResult(b64decode(image, validate=True), duration, image_format,
                           b64decode(mask, validate=True) if mask is not None else None)
    except (ValueError, KeyError, TypeError) as error:
        raise OpenBGError("Invalid response from the API", 200, "INVALID_RESPONSE") from error


def _decode_transform_result(payload: bytes, operation: str) -> ImageTransformResult:
    result = _decode_result(payload)
    try:
        metadata = json.loads(payload)["metadata"]
        if metadata.get("operation") != operation or result.format not in ("jpeg", "jpg", "png", "webp", "avif"):
            raise ValueError("Unexpected operation or format")
        for key in ("original_size", "output_size"):
            value = metadata.get(key)
            if not isinstance(value, list) or len(value) != 2 or any(type(n) is not int or n <= 0 for n in value):
                raise ValueError("Invalid dimensions")
        for key in ("input_bytes", "output_bytes", "bytes_saved"):
            if type(metadata.get(key)) is not int:
                raise ValueError("Invalid byte count")
        if metadata["input_bytes"] <= 0 or metadata["output_bytes"] != len(result.image) or not result.image:
            raise ValueError("Incomplete image")
        if type(metadata.get("retained_original")) is not bool:
            raise ValueError("Invalid retained_original")
        if "quality_used" in metadata and not isinstance(metadata["quality_used"], str):
            raise ValueError("Invalid quality_used")
        if "lossless" in metadata and type(metadata["lossless"]) is not bool:
            raise ValueError("Invalid lossless")
        if "compression_level" in metadata and type(metadata["compression_level"]) is not int:
            raise ValueError("Invalid compression_level")
        if "encoder" in metadata and not isinstance(metadata["encoder"], str):
            raise ValueError("Invalid encoder")
        parsed = ImageTransformMetadata(
            operation=metadata["operation"], format=metadata["format"],
            original_size=tuple(metadata["original_size"]), output_size=tuple(metadata["output_size"]),
            input_bytes=metadata["input_bytes"], output_bytes=metadata["output_bytes"],
            bytes_saved=metadata["bytes_saved"], retained_original=metadata["retained_original"],
            quality_used=metadata.get("quality_used"), lossless=metadata.get("lossless"),
            compression_level=metadata.get("compression_level"), encoder=metadata.get("encoder"),
        )
        return ImageTransformResult(image=result.image, processing_time_ms=result.processing_time_ms,
                                    format=result.format, metadata=parsed)
    except (ValueError, KeyError, TypeError) as error:
        raise OpenBGError("Invalid response from the API", 200, "INVALID_RESPONSE") from error


def _encoding_options(quality: int | None, lossless: bool | None,
                      compression_level: int | None) -> dict[str, int | bool]:
    options: dict[str, int | bool] = {}
    if quality is not None:
        if type(quality) is not int or not 1 <= quality <= 100:
            raise ValueError("quality must be an integer from 1 to 100")
        options["quality"] = quality
    if lossless is not None:
        if type(lossless) is not bool:
            raise ValueError("lossless must be a boolean")
        options["lossless"] = lossless
    if compression_level is not None:
        if type(compression_level) is not int or not 0 <= compression_level <= 9:
            raise ValueError("compression_level must be an integer from 0 to 9")
        options["compression_level"] = compression_level
    return options


class OpenBG:
    def __init__(self, *, api_key: str,
                 base_url: str = "https://openbg-api.gantchevkaloyan.workers.dev",
                 timeout: float = 120):
        if not api_key.strip():
            raise ValueError("An API key is required")
        parsed = urlparse(base_url)
        if parsed.scheme not in ("https", "http") or not parsed.netloc:
            raise ValueError("Use an HTTP or HTTPS API URL")
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be positive")
        self._api_key = api_key
        self._endpoint = f"{parsed.scheme}://{parsed.netloc}/api/v1"
        self._timeout = timeout
        self._opener = build_opener(_NoRedirect())

    def remove_background(self, image: str | Path | bytes, *,
                          format: ImageFormat | None = None, quality: Quality | None = None,
                          return_mask: bool | None = None,
                          resize_options: ResizeOptions | None = None) -> ImageResult:
        options: dict[str, str | int | bool | ResizeOptions] = {}
        if format is not None:
            if format not in ("png", "webp", "gif", "jpg", "jpeg"):
                raise ValueError("Unsupported image format")
            options["format"] = format
        if quality is not None:
            if quality not in ("auto", "quality", "portrait", "product", "speed"):
                raise ValueError("Unsupported quality")
            options["quality"] = quality
        if return_mask is not None:
            if type(return_mask) is not bool:
                raise ValueError("return_mask must be a boolean")
            options["return_mask"] = return_mask
        if resize_options is not None:
            options["resize_options"] = resize_options
        return _decode_result(self._post("remove-background", image, options))

    def compress_image(self, image: str | Path | bytes, *, quality: int | None = None,
                       lossless: bool | None = None, compression_level: int | None = None) -> ImageTransformResult:
        options = _encoding_options(quality, lossless, compression_level)
        return _decode_transform_result(self._post("compress-image", image, options), "compress-image")

    def convert_image(self, image: str | Path | bytes, *, format: StillImageFormat,
                      quality: int | None = None, lossless: bool | None = None,
                      compression_level: int | None = None) -> ImageTransformResult:
        if format not in ("png", "webp", "jpg", "jpeg", "avif"):
            raise ValueError("Unsupported conversion format")
        options = {"format": format, **_encoding_options(quality, lossless, compression_level)}
        return _decode_transform_result(self._post("convert-image", image, options), "convert-image")

    def _post(self, operation: str, image: str | Path | bytes, options: Mapping[str, str | int | bool | ResizeOptions]) -> bytes:
        data = image if isinstance(image, bytes) else Path(image).read_bytes()
        if not 0 < len(data) <= 10 * 1024 * 1024:
            raise OpenBGError("Image must be between 1 byte and 10 MB", code="INVALID_IMAGE_SIZE")
        request = Request(f"{self._endpoint}/{operation}", method="POST", headers={
            "Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json",
            "User-Agent": "openbg-py/0.1.0",
        }, data=json.dumps({"image_data": b64encode(data).decode("ascii"), **options}).encode())
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                return response.read()
        except HTTPError as error:
            try:
                payload = json.loads(error.read())
            except (ValueError, UnicodeError):
                payload = None
            finally:
                error.close()
            message, code = f"Request failed ({error.code})", "API_ERROR"
            if isinstance(payload, dict):
                if isinstance(payload.get("error"), str):
                    message = payload["error"]
                if isinstance(payload.get("error_code"), str):
                    code = payload["error_code"]
            raise OpenBGError(message, error.code, code) from error
