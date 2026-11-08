"""Label-free summary of saved Vision Agent runs and seller reviews.

Usage (from backend/):
    python evaluation/summarize_runs.py
    python evaluation/summarize_runs.py "evaluation/runs/claims_2026*.json"

No ground-truth files are needed. Two sources of evidence:
  1. Guard interventions recorded in each run (what the model asserted vs what survived).
  2. Seller review decisions (accepted/rejected), logged by the confirm_* steps.

These show how often the guards intervene and how often sellers reject what the
model proposed. They cannot measure claims nobody reviewed or defects the model missed.
"""

import collections
import glob
import json
import sys
from pathlib import Path

RUN_GLOB = "evaluation/runs/claims_*.json"
REVIEWS = Path("evaluation/reviews.jsonl")
ASSERTED = ("observed", "inferred")


def claims_of(run, key):
    return run.get(key, {}).get("claims", [])


def category_of(run):
    for claim in claims_of(run, "normalized"):
        if claim.get("attribute") == "category" and claim.get("value"):
            return claim["value"].strip().lower()
    return "unknown"


def model_asserted(claims):
    return any(
        c.get("attribute") == "model" and c.get("status") in ASSERTED and c.get("value")
        for c in claims
    )


def table(rows, header):
    widths = [max(len(str(x)) for x in col) for col in zip(header, *rows)]
    for line in [header, *rows]:
        print("  " + "  ".join(str(x).ljust(w) for x, w in zip(line, widths)))


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else RUN_GLOB
    paths = sorted(glob.glob(pattern))
    runs = [json.loads(Path(p).read_text(encoding="utf-8")) for p in paths]

    if not runs:
        print(f"No runs found for {pattern}")
    else:
        seconds = [r["seconds"] for r in runs if isinstance(r.get("seconds"), (int, float))]
        line = f"{len(runs)} run(s)"
        if seconds:
            line += f", average {sum(seconds) / len(seconds):.0f}s per claims call"
        print(line + "\n")

        raw_status, guarded_status = collections.Counter(), collections.Counter()
        for run in runs:
            raw_status.update(c.get("status") for c in claims_of(run, "raw_model_output"))
            guarded_status.update(c.get("status") for c in claims_of(run, "normalized"))

        print("Claim statuses: model output vs after guards")
        statuses = ["observed", "inferred", "unknown", "requires_user_confirmation"]
        table(
            [[s, raw_status.get(s, 0), guarded_status.get(s, 0)] for s in statuses],
            ["status", "raw", "after guards"],
        )

        actions = collections.Counter(
            c.get("action") for r in runs for c in r.get("corrections", [])
        )
        print("\nGuard interventions (total, per run)")
        table(
            [[a, n, f"{n / len(runs):.1f}"] for a, n in actions.most_common()] or [["none", 0, "0.0"]],
            ["action", "count", "per run"],
        )

        raw_model = sum(model_asserted(claims_of(r, "raw_model_output")) for r in runs)
        kept_model = sum(model_asserted(claims_of(r, "normalized")) for r in runs)
        not_found = actions.get("downgraded_unverified_model", 0)
        found = actions.get("model_corroborated_by_ocr", 0)
        print("\nModel identification")
        print(f"  runs where the model asserted a model: {raw_model}/{len(runs)}")
        print(f"  ...OCR found the text in a photo:       {found}")
        print(f"  ...OCR found nothing (unsupported):     {not_found}")
        print(f"  runs still asserting a model after guards: {kept_model}/{len(runs)}")

        by_category = collections.defaultdict(list)
        for run in runs:
            by_category[category_of(run)].append(run)
        print("\nBy category")
        rows = []
        for cat, group in sorted(by_category.items()):
            fixes = sum(len(r.get("corrections", [])) for r in group)
            raw_obs = sum(
                c.get("status") == "observed"
                for r in group for c in claims_of(r, "raw_model_output")
            )
            kept_obs = sum(
                c.get("status") == "observed"
                for r in group for c in claims_of(r, "normalized")
            )
            rows.append([cat, len(group), f"{fixes / len(group):.1f}", raw_obs, kept_obs])
        table(rows, ["category", "runs", "corrections/run", "observed (raw)", "observed (guarded)"])

    print("\nSeller review decisions")
    if not REVIEWS.exists():
        print("  none logged yet")
        return

    entries = [
        json.loads(line)
        for line in REVIEWS.read_text(encoding="utf-8").splitlines() if line.strip()
    ]
    by_attr = collections.defaultdict(collections.Counter)
    by_cat = collections.defaultdict(collections.Counter)
    for e in entries:
        by_attr[e["attribute"]][e["decision"]] += 1
        by_cat[e.get("category") or "unknown"][e["decision"]] += 1

    def rows_for(groups):
        out = []
        for key, c in sorted(groups.items()):
            total = c["accepted"] + c["rejected"]
            out.append([key, c["accepted"], c["rejected"], f"{100 * c['rejected'] / total:.0f}%"])
        return out

    table(rows_for(by_attr), ["attribute", "accepted", "rejected", "rejection rate"])
    print()
    table(rows_for(by_cat), ["category", "accepted", "rejected", "rejection rate"])


if __name__ == "__main__":
    main()