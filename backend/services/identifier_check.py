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