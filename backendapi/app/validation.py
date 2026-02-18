from __future__ import annotations

import io

from PIL import Image, ImageFilter, ImageStat

from .errors import AppError


JPEG_PREFIX = b"\xff\xd8\xff"
PNG_PREFIX = b"\x89PNG\r\n\x1a\n"


def _is_allowed_image(image_bytes: bytes) -> bool:
    return image_bytes.startswith(JPEG_PREFIX) or image_bytes.startswith(PNG_PREFIX)


def validate_image(image_bytes: bytes, max_bytes: int) -> None:
    if not image_bytes:
        raise AppError("MISSING_IMAGE", "Image file is required.", 400)

    if len(image_bytes) > max_bytes:
        raise AppError("IMAGE_TOO_LARGE", f"Image exceeds {max_bytes} bytes.", 413)

    if not _is_allowed_image(image_bytes):
        raise AppError("UNSUPPORTED_IMAGE", "Only JPG and PNG images are allowed.", 415)


def analyze_image_quality(
    image_bytes: bytes,
    max_bytes: int,
    min_width: int,
    min_height: int,
    max_dimension: int,
    min_brightness_mean: float,
    max_brightness_mean: float,
    min_edge_intensity: float,
) -> dict[str, float | int | str]:
    validate_image(image_bytes, max_bytes)

    try:
        img = Image.open(io.BytesIO(image_bytes))
        image_format = (img.format or "unknown").lower()
        img.verify()
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise AppError("INVALID_IMAGE", "Image quality insufficient for analysis. Please retake photo.", 422)

    width, height = img.size
    if width < min_width or height < min_height or width > max_dimension or height > max_dimension:
        raise AppError("INVALID_IMAGE", "Image quality insufficient for analysis. Please retake photo.", 422)

    gray = img.convert("L")
    brightness_mean = float(ImageStat.Stat(gray).mean[0])
    if brightness_mean < min_brightness_mean or brightness_mean > max_brightness_mean:
        raise AppError("INVALID_IMAGE", "Image quality insufficient for analysis. Please retake photo.", 422)

    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge_intensity = float(ImageStat.Stat(edges).mean[0])
    if edge_intensity < min_edge_intensity:
        raise AppError("INVALID_IMAGE", "Image quality insufficient for analysis. Please retake photo.", 422)

    return {
        "width": width,
        "height": height,
        "brightness_mean": round(brightness_mean, 2),
        "edge_intensity": round(edge_intensity, 2),
        "format": image_format,
    }
