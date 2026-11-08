"""Conservative, auditable post-processing of Vision Agent claims.

These checks enforce structure and permitted evidence references, not visual truth.
"""

import copy

REQUIRED_ATTRIBUTES = (
    "category", "brand", "model", "color", "condition",
    "accessories", "functionality", "authenticity",
)

UNVERIFIED_STATUSES = {"unknown", "requires_user_confirmation"}
NEVER_FROM_PHOTOS = {"functionality", "authenticity"}


def _downgrade(claim: dict, reason: str, status: str = "unknown") -> None:
    claim.update(
        status=status,
        value=None,
        evidence_image=None,
        evidence_description=None,
        uncertainty_reason=reason,
    )


def normalize_claims(raw_data: dict) -> tuple[dict, list[dict]]:
    """Discard values/evidence attached to unverified claims.

    Also fail closed when an observed/inferred claim is missing required
    fields. Preserve each change in the correction log.
    """
    data = copy.deepcopy(raw_data)
    changes = []
    for index, claim in enumerate(data.get("claims", [])):
        status = claim.get("status")
        if status in UNVERIFIED_STATUSES:
            if any(claim.get(k) is not None for k in (
                "value", "evidence_image", "evidence_description"
            )):
                old = {k: claim.get(k) for k in (
                    "value", "evidence_image", "evidence_description"
                )}
                reason = claim.get("uncertainty_reason") or (
                    "Model supplied unverified information; removed."
                )
                _downgrade(claim, reason, status=status)
                changes.append({
                    "claim_index": index, "attribute": claim.get("attribute"),
                    "action": "removed_unverified_information", "original_fields": old,
                })
        elif status in {"observed", "inferred"}:
            value = claim.get("value")
            description = claim.get("evidence_description")
            if (not isinstance(value, str) or not value.strip()
                    or not isinstance(description, str) or not description.strip()
                    or (status == "observed" and claim.get("evidence_image") is None)):
                _downgrade(claim, "Claim lacked the evidence or value required by its status.")
                changes.append({
                    "claim_index": index, "attribute": claim.get("attribute"),
                    "action": "downgraded_incomplete_claim",
                })
    return data, changes


def sanitize_evidence(raw_data: dict, image_count: int) -> tuple[dict, list[dict]]:
    """Remove claims citing out-of-range or invalid photograph indices."""
    if image_count < 0:
        raise ValueError("image_count must be nonnegative")
    data = copy.deepcopy(raw_data)
    changes = []
    for index, claim in enumerate(data.get("claims", [])):
        cited = claim.get("evidence_image")
        if cited is None:
            continue
        if type(cited) is not int or not 0 <= cited < image_count:
            _downgrade(claim, "Evidence image reference was invalid.")
            changes.append({
                "claim_index": index, "attribute": claim.get("attribute"),
                "action": "downgraded_invalid_image_reference", "original_index": cited,
            })
    return data, changes


def enforce_unverifiable(raw_data: dict) -> tuple[dict, list[dict]]:
    """Photos alone cannot establish functionality or authenticity."""
    data = copy.deepcopy(raw_data)
    changes = []
    for index, claim in enumerate(data.get("claims", [])):
        if (claim.get("attribute") in NEVER_FROM_PHOTOS
                and claim.get("status") in {"observed", "inferred"}):
            original_status = claim.get("status")
            original_value = claim.get("value")
            _downgrade(
                claim, "Cannot be verified from photographs; seller confirmation required.",
                status="requires_user_confirmation",
            )
            changes.append({
                "claim_index": index, "attribute": claim.get("attribute"),
                "original_status": original_status, "original_value": original_value,
                "action": "downgraded_unverifiable_attribute",
            })
    return data, changes


def resolve_claim_set(raw_data: dict) -> tuple[dict, list[dict]]:
    """Ensure one claim per required attribute and retain distinct defects.

    Conflicting claims are resolved conservatively: unverified claims win
    over confident claims for the same attribute, rather than upgrading
    uncertainty into unsupported certainty.
    """
    data = copy.deepcopy(raw_data)
    changes = []
    deduped = []
    positions = {}
    priority = {"requires_user_confirmation": 0, "unknown": 1,
                "inferred": 2, "observed": 3}

    for claim in data.get("claims", []):
        attribute = claim.get("attribute")
        if attribute == "defect":
            deduped.append(claim)
            continue
        if attribute not in positions:
            positions[attribute] = len(deduped)
            deduped.append(claim)
        else:
            pos = positions[attribute]
            previous = deduped[pos]
            if priority.get(claim.get("status"), 99) < priority.get(previous.get("status"), 99):
                deduped[pos] = claim
            changes.append({"attribute": attribute, "action": "resolved_duplicate_attribute"})

    for attribute in REQUIRED_ATTRIBUTES:
        if attribute not in positions:
            deduped.append({
                "attribute": attribute,
                "value": None,
                "status": "unknown",
                "evidence_image": None,
                "evidence_description": None,
                "uncertainty_reason": "The model did not address this attribute.",
            })
            changes.append({"attribute": attribute, "action": "added_missing_attribute"})

    data["claims"] = deduped
    return data, changes
