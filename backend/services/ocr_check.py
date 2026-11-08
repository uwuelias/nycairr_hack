import re
from functools import lru_cache


def _normalize(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def text_corroborated(model_text: str, ocr_text_value: str) -> bool:
    """True only if the model's text appears in the OCR output."""
    target = _normalize(model_text)
    return len(target) >= 3 and target in _normalize(ocr_text_value)


@lru_cache(maxsize=1)
def _engine():
    from rapidocr_onnxruntime import RapidOCR
    return RapidOCR()


def ocr_text(image_path: str) -> str:
    result, _ = _engine()(image_path)
    if not result:
        return ""
    return " ".join(item[1] for item in result)