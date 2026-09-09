from io import BytesIO

from PIL import Image, UnidentifiedImageError


class InvalidImageError(ValueError):
    """Raised when incoming bytes cannot be decoded as a supported image."""


def decode_rgb_image(image_bytes: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.load()
            return image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise InvalidImageError("Image bytes could not be decoded.") from error
