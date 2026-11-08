import collections
import sys
import time

from agents.vision_agent import _load_images, _read_label_sync
from services.ocr_check import ocr_text, text_corroborated

N = 10

for path in sys.argv[1:]:
    image = _load_images([path])[0]
    ocr = ocr_text(image)  # OCR is deterministic, so run it once per photo
    tally = collections.Counter()

    started = time.time()
    for _ in range(N):
        reading = _read_label_sync(image)
        if reading.model_text:
            if text_corroborated(reading.model_text, ocr):
                tally["read + OCR-corroborated"] += 1
            else:
                tally[f"read + OCR-REJECTED ({reading.model_text})"] += 1
        else:
            tally["refused"] += 1
    avg = (time.time() - started) / N

    print(f"{path} | ocr: {ocr[:60]!r} | avg {avg:.1f}s per call")
    for outcome, count in tally.items():
        print(f"   {outcome}: {count}/{N}")