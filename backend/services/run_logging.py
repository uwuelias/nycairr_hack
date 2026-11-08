import json
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
RUN_DIR = BACKEND_DIR / "evaluation" / "runs"
REVIEW_LOG = BACKEND_DIR / "evaluation" / "reviews.jsonl"


def save_run(kind, images, raw_data, normalized_data, corrections,
             override, seconds, extra=None):
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    record = {
        "kind": kind,
        "timestamp": stamp,
        "images": [Path(p).name for p in images],
        "seconds": seconds,
        "extra": extra or {},
        "raw_model_output": raw_data,
        "normalized": normalized_data,
        "corrections": corrections,
        "next_action_override": override,
    }
    path = RUN_DIR / f"{kind}_{stamp}_{int(time.time() * 1000) % 1000:03d}.json"
    path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return path


def log_review(attribute, value, decision, category=None, evidence_image=None):
    """Append one seller decision (accepted/rejected) on a model proposal."""
    REVIEW_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "category": category,
        "attribute": attribute,
        "value": value,
        "evidence_image": evidence_image,
        "decision": decision,
    }
    with REVIEW_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
