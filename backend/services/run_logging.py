import json
import time
from pathlib import Path

RUN_DIR = Path("evaluation/runs")


def save_run(kind, images, raw_data, normalized_data, corrections, override, seconds):
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    record = {
        "kind": kind,
        "timestamp": stamp,
        "images": [Path(p).name for p in images],
        "seconds": seconds,
        "raw_model_output": raw_data,
        "normalized": normalized_data,
        "corrections": corrections,
        "next_action_override": override,
    }
    path = RUN_DIR / f"{kind}_{stamp}_{int(time.time() * 1000) % 1000:03d}.json"
    path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return path