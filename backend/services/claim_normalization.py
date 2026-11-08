"""Conservative, auditable post-processing of Vision Agent claims.

These checks enforce structure and permitted evidence references, not visual truth.
"""
import re
import copy

REQUIRED_ATTRIBUTES = (
    "category", "brand", "model", "color", "condition",
    "accessories", "functionality", "authenticity",
)

UNVERIFIED_STATUSES = {"unknown", "requires_user_confirmation"}
NEVER_FROM_PHOTOS = {"functionality", "authenticity"}

def _resolve_attribute_candidates(
    attribute: str,
    candidates: list[dict],
) -> dict:
    """Resolve attribute candidates while preserving reliable identity evidence."""
    if not candidates:
        raise ValueError(
            f"No candidates provided for attribute {attribute!r}."
        )

    identity = {"category", "brand", "model", "color"}

    priority = {
        "requires_user_confirmation": 0,
        "unknown": 1,
        "inferred": 2,
        "observed": 3,
        "seller_confirmed": 3,
    }

    def conservative():
        return copy.deepcopy(
            min(
                candidates,
                key=lambda claim: priority.get(
                    claim.get("status"), 99
                ),
            )
        )

    # Seller-confirmed claims must have meaningful values.
    confirmed = [
        claim
        for claim in candidates
        if claim.get("status") == "seller_confirmed"
        and isinstance(claim.get("value"), str)
        and claim["value"].strip()
    ]

    if confirmed:
        usable = confirmed

    elif attribute not in identity:
        return conservative()

    elif any(
        claim.get("status") == "requires_user_confirmation"
        for claim in candidates
    ):
        return copy.deepcopy(
            next(
                claim
                for claim in candidates
                if claim.get("status") == "requires_user_confirmation"
            )
        )

    else:
        usable = [
            claim
            for claim in candidates
            if claim.get("status") in {"observed", "inferred"}
            and isinstance(claim.get("value"), str)
            and claim["value"].strip()
            and isinstance(
                claim.get("evidence_description"), str
            )
            and claim["evidence_description"].strip()
            and type(claim.get("evidence_image")) is int
            and claim["evidence_image"] >= 0
        ]

        if not usable:
            return conservative()

    # Never guess when supported values conflict.
    values = {
        " ".join(claim["value"].casefold().split())
        for claim in usable
    }

    if len(values) > 1:
        result = copy.deepcopy(usable[0])
        _downgrade(
            result,
            "Conflicting supported values require seller clarification.",
        )
        return result

    # Prefer observed evidence over inference when values agree.
    return copy.deepcopy(
        min(
            usable,
            key=lambda claim: {
                "seller_confirmed": 0,
                "observed": 1,
                "inferred": 2,
            }.get(claim.get("status"), 99),
        )
    )

def extract_condition_defects(raw_data: dict) -> tuple[dict, list[dict]]:
    """Copy explicit model-described damage into inferred review proposals."""
    data = copy.deepcopy(raw_data)
    changes = []
    additions = []

    damage = re.compile(
        r"\b(?:peel(?:ing|ed|s)?|flak(?:ing|ed|es)|"
        r"crack(?:s|ed|ing)?|chip(?:s|ped|ping)?|dent(?:s|ed|ing)?|"
        r"scratch(?:es|ed|ing)?|scuff(?:s|ed|ing)?|"
        r"tear(?:s)?|torn|fray(?:s|ed|ing)?|broken|"
        r"exposed\s+(?:foam|padding))\b",
        re.I,
    )
    location = re.compile(
        r"\b(?:headband|ear[\s-]*cups?|earpads?|padding|hinges?|"
        r"screen|display|frame|glass|corners?|edges?|"
        r"(?:charging|usb|lightning)[\s-]+port|casing|shell)\b",
        re.I,
    )
    negative = re.compile(
        r"\b(?:no|not|never|neither|without|undamaged|intact)\b"
        r"|\bfree\s+(?:of|from)\b"
        r"|\b(?:cannot|can't|unable to)\s+(?:see|detect|confirm|identify)\b",
        re.I,
    )

    for index, claim in enumerate(data.get("claims", [])):
        if (
            claim.get("attribute") != "condition"
            or claim.get("status") not in {"observed", "inferred"}
        ):
            continue

        description = claim.get("evidence_description") or ""
        cited = claim.get("evidence_image")
        if type(cited) is not int or cited < 0:
            continue

        clauses = re.split(
            r"[.!?;]+|\b(?:but|however)\b",
            description,
            flags=re.I,
        )
        excerpt = next(
            (
                clause.strip(" ,:")
                for clause in clauses
                if damage.search(clause)
                and location.search(clause)
                and not negative.search(clause)
            ),
            None,
        )
        if not excerpt:
            continue

        proposal = {
            "attribute": "defect",
            "value": excerpt,
            "status": "inferred",
            "evidence_image": cited,
            "evidence_description": description,
            "uncertainty_reason": (
                "Extracted from the model's condition description, including "
                "any stated ambiguity; requires seller review."
            ),
        }

        # Avoid an exact duplicate already emitted as a defect.
        # Paraphrases remain separate rather than risking a false merge.
        if any(
            candidate.get("attribute") == "defect"
            and candidate.get("value") == proposal["value"]
            and candidate.get("evidence_description") == description
            for candidate in data.get("claims", []) + additions
        ):
            continue

        additions.append(proposal)
        changes.append({
            "action": "extracted_defect_from_condition",
            "source_claim_index": index,
            "original_claim": copy.deepcopy(claim),
            "proposal": copy.deepcopy(proposal),
        })

    data["claims"].extend(additions)
    return data, changes

def _downgrade(claim: dict, reason: str, status: str = "unknown") -> None:
    claim.update(
        status=status,
        value=None,
        evidence_image=None,
        evidence_description=None,
        uncertainty_reason=reason,
    )


def normalize_claims(raw_data: dict) -> tuple[dict, list[dict]]:
    """Normalize model claims without manufacturing verified identities."""
    data = copy.deepcopy(raw_data)
    changes = []

    for index, claim in enumerate(data.get("claims", [])):
        status = claim.get("status")
        attribute = claim.get("attribute")
        original = copy.deepcopy(claim)

        if status in UNVERIFIED_STATUSES:
            fields = ("value", "evidence_image", "evidence_description")

            if any(claim.get(key) is not None for key in fields):
                reason = claim.get("uncertainty_reason") or (
                    "Model supplied unverified information; removed."
                )
                _downgrade(claim, reason, status=status)
                changes.append({
                    "claim_index": index,
                    "attribute": attribute,
                    "action": "removed_unverified_information",
                    "original_fields": {
                        key: original.get(key) for key in fields
                    },
                    "original_claim": original,
                })
            continue

        if status not in {"observed", "inferred", "seller_confirmed"}:
            # Existing model-status guard and Pydantic validation reject this.
            continue

        value = claim.get("value")
        description = claim.get("evidence_description")

        if is_placeholder_value(value):
            _downgrade(
                claim,
                "The supplied value was a placeholder, not an identified "
                "fact or a meaningful proposal.",
            )
            changes.append({
                "claim_index": index,
                "attribute": attribute,
                "action": "downgraded_placeholder_value",
                "original_claim": original,
            })
            continue

        if (
            not isinstance(value, str)
            or not value.strip()
            or not isinstance(description, str)
            or not description.strip()
            or (
                status == "observed"
                and claim.get("evidence_image") is None
            )
        ):
            _downgrade(
                claim,
                "Claim lacked the evidence or value required by its status.",
            )
            changes.append({
                "claim_index": index,
                "attribute": attribute,
                "action": "downgraded_incomplete_claim",
                "original_claim": original,
            })
            continue

        if attribute == "model" and status in {"observed", "inferred"}:
            note = (
                "AI-generated exact model identification; seller "
                "confirmation required. The model's own description "
                "is not independent verification."
            )
            previous_reason = claim.get("uncertainty_reason") or ""
            claim["status"] = "inferred"

            if note not in previous_reason:
                claim["uncertainty_reason"] = (
                    f"{previous_reason} {note}".strip()
                )

            if claim != original:
                changes.append({
                    "claim_index": index,
                    "attribute": attribute,
                    "action": "model_identification_requires_confirmation",
                    "original_claim": original,
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


def is_placeholder_value(value: object) -> bool:
    """Match whole placeholders, never words within useful descriptions."""
    if not isinstance(value, str):
        return False

    text = re.sub(r"[\W_]+", " ", value.casefold()).strip()

    return text in {
        "",
        "unknown",
        "n a",
        "na",
        "none",
        "null",
        "nil",
        "not known",
        "not available",
        "not applicable",
        "unspecified",
        "undetermined",
        "unavailable",
        "unclear",
        "not sure",
        "cannot determine",
        "cannot be determined",
        "unable to determine",
        "insufficient information",
        "tbd",
        "to be determined",
    }

def resolve_claim_set(raw_data: dict) -> tuple[dict, list[dict]]:
    """Resolve attribute conflicts and merge identical defect proposals."""
    data = copy.deepcopy(raw_data)
    changes = []
    resolved = []
    positions = {}
    defect_positions = {}

    # Lower numbers represent more conservative claim statuses.
    priority = {
        "requires_user_confirmation": 0,
        "unknown": 1,
        "inferred": 2,
        "observed": 3,
        "seller_confirmed": 3,
    }

    def canonical(value):
        return " ".join(str(value or "").casefold().split())

    for claim in data.get("claims", []):
        attribute = claim.get("attribute")

        # Keep separate defects unless their descriptions match exactly.
        if attribute == "defect":
            key = (
                canonical(claim.get("value")),
                canonical(claim.get("evidence_description")),
            )

            mergeable = (
                claim.get("status") in {"observed", "inferred"}
                and all(key)
            )

            if mergeable and key in defect_positions:
                position = defect_positions[key]
                kept = resolved[position]

                # Preserve uncertainty when either claim is inferred.
                if claim.get("status") == "inferred":
                    kept["status"] = "inferred"

                notes = [
                    text
                    for text in (
                        kept.get("uncertainty_reason"),
                        claim.get("uncertainty_reason"),
                    )
                    if text
                ]
                kept["uncertainty_reason"] = (
                    " ".join(dict.fromkeys(notes)) or None
                )

                # Preserve the duplicate's original evidence in the log.
                changes.append({
                    "attribute": "defect",
                    "action": "merged_duplicate_defect",
                    "kept_claim_index": position,
                    "primary_evidence_image": kept.get("evidence_image"),
                    "additional_claim": copy.deepcopy(claim),
                })
                continue

            if mergeable:
                defect_positions[key] = len(resolved)

            resolved.append(claim)
            continue

        # Resolve duplicate non-defect attributes.
        if attribute not in positions:
            candidates = [
                candidate for candidate in data.get("claims", [])
                if candidate.get("attribute") == attribute
            ]
            selected = _resolve_attribute_candidates(attribute, candidates)
            positions[attribute] = len(resolved)
            resolved.append(selected)

            if len(candidates) > 1:
                changes.append({
                    "attribute": attribute,
                    "action": "resolved_duplicate_attribute",
                    "original_claims": copy.deepcopy(candidates),
                    "selected_claim": copy.deepcopy(selected),
                })


    # Ensure all required attributes exist.
    for attribute in REQUIRED_ATTRIBUTES:
        if attribute not in positions:
            resolved.append({
                "attribute": attribute,
                "value": None,
                "status": "unknown",
                "evidence_image": None,
                "evidence_description": None,
                "uncertainty_reason": (
                    "The model did not address this attribute."
                ),
            })

            changes.append({
                "attribute": attribute,
                "action": "added_missing_attribute",
            })

    # Require an individual defect claim to support observed damage.
    has_defect = any(
        claim.get("attribute") == "defect"
        and claim.get("status") in {
            "observed",
            "inferred",
            "seller_confirmed",
        }
        and claim.get("value")
        and claim.get("evidence_image") is not None
        for claim in resolved
    )

    for claim in resolved:
        if (
            claim.get("attribute") == "condition"
            and claim.get("status") == "observed"
            and canonical(claim.get("value")) == "damaged"
            and not has_defect
        ):
            original = copy.deepcopy(claim)

            _downgrade(
                claim,
                "The model reported damage but did not provide "
                "a separate defect claim for verification.",
            )

            changes.append({
                "attribute": "condition",
                "action": "downgraded_unsupported_damage",
                "original_claim": original,
            })

    data["claims"] = resolved
    return data, changes

