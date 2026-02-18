from __future__ import annotations

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
