
import base64
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


MAX_SIZE = 10 * 1024 * 1024


def prepare_image(path: str | Path) -> str:
    path = Path(path)

    if not path.is_file():
        raise FileNotFoundError(path)

    if path.stat().st_size > MAX_SIZE:
        raise ValueError("Image exceeds 10 MB")

    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original)
        image = image.convert("RGB")
        image.thumbnail((1600, 1600))

        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=90)

    encoded = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    return f"data:image/jpeg;base64,{encoded}"
