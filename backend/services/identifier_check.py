
import copy
import re


HEDGING_PATTERNS = (
    r"\bappears?\b",
    r"\bseems?\b",
    r"\bpossibly\b",
    r"\bpotentially\b",
    r"\bmaybe\b",
    r"\bmight\b",
    r"\bcould\b",
    r"\bsuggests?\b",
    r"\bconsistent with\b",
    r"\blikely\b",
)
PROPOSAL_ONLY = {"defect", "color"}


def require_proposal_confirmation(raw_data: dict) -> tuple[dict, list[dict]]:
    """Defect and color claims from a small vision model are proposals.
    They are never 'observed' until the seller confirms them."""
    data = copy.deepcopy(raw_data)
    changes = []
    for index, claim in enumerate(data.get("claims", [])):
        if claim.get("attribute") in PROPOSAL_ONLY and claim.get("status") == "observed":
            claim["status"] = "inferred"
            if not claim.get("uncertainty_reason"):
                claim["uncertainty_reason"] = (
                    "Detected by a small vision model; awaiting seller confirmation."
                )
            changes.append({
                "claim_index": index,
                "attribute": claim.get("attribute"),
                "action": "capped_at_inferred_pending_seller",
                "value": claim.get("value"),
            })
    return data, changes
def downgrade_hedged_observations(data: dict) -> tuple[dict, list[dict]]:
    """
    Downgrade observed claims that contain explicit
    uncertainty language in their evidence.

    This is a conservative heuristic, not visual verification.
    """
    data = copy.deepcopy(data)
    corrections = []

    for index, claim in enumerate(data.get("claims", [])):
        if claim.get("status") != "observed":
            continue

        evidence = claim.get("evidence_description") or ""
        uncertainty = claim.get("uncertainty_reason") or ""

        combined = f"{evidence} {uncertainty}"

        if not any(
            re.search(pattern, combined, flags=re.IGNORECASE)
            for pattern in HEDGING_PATTERNS
        ):
            continue

        corrections.append({
            "claim_index": index,
            "attribute": claim.get("attribute"),
            "original_status": "observed",
            "action": "downgraded_hedged_observation",
        })

        claim["status"] = "inferred"

        if not claim.get("uncertainty_reason"):
            claim["uncertainty_reason"] = (
                "The supporting description expresses uncertainty."
            )

    return data, corrections