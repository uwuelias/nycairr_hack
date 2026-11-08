import pytest
import json
import copy
import agents.vision_agent as vision
from types import SimpleNamespace
from agents.vision_agent import confirm_claims
from services import run_logging
from pydantic import ValidationError
from services.ocr_check import text_corroborated
from schemas.photo_coverage import PhotoCoverage
from services.category_profiles import GENERIC, match_profile
from services.claim_normalization import enforce_unverifiable
from services.photo_validation import validate_photo_coverage
from schemas.claims import Claim, VisionResult
from services.claim_normalization import (
    REQUIRED_ATTRIBUTES,
    resolve_claim_set,
    sanitize_evidence,
    normalize_claims,
)



# ---- Claim validation ----

def test_observed_claim_with_image_is_valid():
    Claim(attribute="brand", value="Sony", status="observed",
          evidence_image=0, evidence_description="Sony logo visible")


def test_observed_claim_without_image_fails():
    with pytest.raises(ValidationError):
        Claim(attribute="brand", value="Sony", status="observed",
              evidence_description="Sony logo visible")


def test_unknown_claim_with_value_fails():
    with pytest.raises(ValidationError):
        Claim(attribute="model", value="WH-1000XM4", status="unknown")


def test_unknown_claim_with_reason_is_valid():
    Claim(attribute="model", status="unknown",
          uncertainty_reason="Model number not visible.")


# ---- Claim set resolution ----

def test_duplicate_condition_keeps_conservative_status():
    raw = {"claims": [
        {"attribute": "condition", "value": None, "status": "unknown"},
        {"attribute": "condition", "value": "minor wear", "status": "inferred",
         "evidence_image": 1, "evidence_description": "dark spot"},
    ]}
    data, _ = resolve_claim_set(raw)
    conds = [c for c in data["claims"] if c["attribute"] == "condition"]
    assert len(conds) == 1
    assert conds[0]["status"] == "unknown"


def test_missing_attributes_added_as_unknown():
    data, _ = resolve_claim_set({"claims": []})
    attrs = {c["attribute"] for c in data["claims"]}
    assert attrs == set(REQUIRED_ATTRIBUTES)
    assert all(c["status"] == "unknown" for c in data["claims"])


# ---- Evidence sanitizing ----

def test_out_of_range_citation_is_downgraded():
    raw = {"claims": [{
        "attribute": "brand", "value": "Sony", "status": "observed",
        "evidence_image": 2, "evidence_description": "logo visible",
    }]}
    data, log = sanitize_evidence(raw, image_count=2)
    claim = data["claims"][0]
    assert claim["status"] == "unknown"
    assert claim["value"] is None
    assert len(log) == 1


def test_valid_citation_is_kept():
    raw = {"claims": [{
        "attribute": "brand", "value": "Sony", "status": "observed",
        "evidence_image": 1, "evidence_description": "logo visible",
    }]}
    data, log = sanitize_evidence(raw, image_count=2)
    assert data["claims"][0]["status"] == "observed"
    assert log == []

def test_text_corroborated_ignores_spacing_and_case():
    assert text_corroborated("WH-1000XM4", "Sony  wh 1000xm4  MADE IN CHINA")

def test_text_not_corroborated_when_absent():
    assert not text_corroborated("WH-1000XM4", "SONY")

def test_empty_ocr_is_not_corroboration():
    assert not text_corroborated("WH-1000XM4", "")
def test_headphones_not_matched_as_phone():
    assert match_profile("Headphones").name == "headphones"
    assert match_profile("wireless headphones").name == "headphones"


def test_phone_variants_match_smartphone():
    assert match_profile("iPhone").name == "smartphone"
    assert match_profile("smartphone").name == "smartphone"


def test_unknown_or_empty_category_falls_back_to_generic():
    assert match_profile("robot vacuum") is GENERIC
    assert match_profile("") is GENERIC
    assert match_profile(None) is GENERIC


def _coverage(views, issues=None):
    return PhotoCoverage(
        product_category="laptop",
        visible_views=views,
        missing_views=[],
        image_quality_issues=issues or [],
        coverage_sufficient=True,
    )


def test_laptop_requires_its_own_views():
    d = validate_photo_coverage(_coverage(["top"]), match_profile("laptop"))
    assert not d.allowed_to_list
    assert set(d.missing_views) == {"screen", "keyboard", "ports", "bottom"}


def test_generic_profile_allows_when_all_views_present():
    d = validate_photo_coverage(
        _coverage(["front", "back", "top", "bottom", "side"]), GENERIC
    )
    assert d.allowed_to_list


def test_functionality_never_stays_inferred():
    raw = {"claims": [{
        "attribute": "functionality", "value": "works", "status": "inferred",
        "evidence_image": 0, "evidence_description": "screen is on",
    }]}
    data, log = enforce_unverifiable(raw)
    claim = data["claims"][0]
    assert claim["status"] == "requires_user_confirmation"
    assert claim["value"] is None
    assert len(log) == 1
def _review_result():
    return VisionResult(
        claims=[
            Claim(
                attribute="defect",
                value="Headband peeling",
                status="inferred",
                evidence_image=0,
                evidence_description="Peeling visible on the headband.",
            ),
            Claim(
                attribute="defect",
                value="Earcup scratch",
                status="inferred",
                evidence_image=1,
                evidence_description="Scratch reported on the earcup.",
            ),
            Claim(
                attribute="color",
                value="Black",
                status="inferred",
                evidence_image=0,
                evidence_description="Black surface visible.",
            ),
        ],
        next_action="request_user_confirmation",
        question="Which claims are correct?",
    )
def test_damaged_condition_without_defect_is_downgraded():
    raw = {
        "claims": [
            {
                "attribute": "condition",
                "value": "damaged",
                "status": "observed",
                "evidence_image": 2,
                "evidence_description": (
                    "The charging port is visibly damaged with a large hole."
                ),
                "uncertainty_reason": None,
            }
        ]
    }

    normalized, corrections = resolve_claim_set(raw)

    condition = next(
        c for c in normalized["claims"]
        if c["attribute"] == "condition"
    )

    assert condition["status"] == "unknown"
    assert condition["value"] is None
    assert condition["evidence_image"] is None
    assert any(
        c["action"] == "downgraded_unsupported_damage"
        for c in corrections
    )
# ============================================================
# TEST DATA
# ============================================================

PEELING = (
    "The headband shows significant wear and peeling, suggesting a worn "
    "condition. The peeling is located on the upper left portion "
    "of the headband."
)

SCRATCH = (
    "A small, dark spot is visible on the right earcup, "
    "likely a scratch."
)


def _condition(description, evidence_image=1):
    """Create a condition claim with a configurable image reference."""
    return {
        "attribute": "condition",
        "value": "worn",
        "status": "inferred",
        "evidence_image": evidence_image,
        "evidence_description": description,
    }


def _mock_analysis(monkeypatch, claims, category="headphones"):
    """Run the real claim pipeline with a mocked Ollama response."""
    payload = {
        "claims": [
            {
                "attribute": "category",
                "value": category,
                "status": "inferred",
                "evidence_image": 0,
                "evidence_description": "Visible product category.",
            },
            *claims,
        ],
        "next_action": "continue",
        "question": None,
    }

    calls = []

    def fake_chat(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            message=SimpleNamespace(content=json.dumps(payload))
        )

    monkeypatch.setattr(vision, "chat", fake_chat)

    result = vision._analyze_claims_sync(
        ["photo-0", "photo-1", "photo-2"],
        match_profile(category),
    )

    assert len(calls) == 1
    return result


@pytest.fixture
def review_events(monkeypatch):
    """Capture seller-review logging without writing to disk."""
    events = []

    monkeypatch.setattr(
        vision,
        "log_review",
        lambda *args: events.append(args),
    )

    return events


# ============================================================
# DEFECT EXTRACTION TESTS
# ============================================================

def test_explicit_peeling_reaches_review_and_preserves_evidence(
    monkeypatch,
):
    result = _mock_analysis(
        monkeypatch,
        [_condition(PEELING, evidence_image=2)],
    )

    defect, = [
        claim for claim in result.claims
        if claim.attribute == "defect"
    ]

    assert "peeling" in defect.value
    assert defect.status == "inferred"
    assert defect.evidence_image == 2
    assert defect.evidence_description == PEELING
    assert result.next_action == "request_user_confirmation"


@pytest.mark.parametrize(
    "description",
    [
        "The headband shows wear and discoloration.",
        "No cracks or peeling are visible on the headband.",
    ],
)
def test_generic_or_negated_wear_does_not_create_damage(
    monkeypatch,
    description,
):
    result = _mock_analysis(
        monkeypatch,
        [_condition(description, evidence_image=2)],
    )

    assert not any(
        claim.attribute == "defect"
        for claim in result.claims
    )


def test_both_condition_findings_survive_as_uncertain_proposals(
    monkeypatch,
):
    result = _mock_analysis(
        monkeypatch,
        [
            _condition(PEELING, evidence_image=2),
            _condition(SCRATCH, evidence_image=1),
        ],
    )

    defects = [
        claim for claim in result.claims
        if claim.attribute == "defect"
    ]

    assert len(defects) == 2

    peeling = next(
        claim for claim in defects
        if "peeling" in claim.value
    )

    scratch = next(
        claim for claim in defects
        if "scratch" in claim.value
    )

    assert peeling.status == "inferred"
    assert peeling.evidence_image == 2

    assert scratch.status == "inferred"
    assert scratch.evidence_image == 1
    assert scratch.evidence_description == SCRATCH

    # Unconfirmed AI proposals must not generate 3D markers.
    assert vision.viewer_defects(result) == []


# ============================================================
# IDENTITY RESOLUTION TESTS
# ============================================================

def test_supported_model_candidate_survives_empty_unknown():
    observed = {
        "attribute": "model",
        "value": "WH-1000XM4",
        "status": "observed",
        "evidence_image": 1,
        "evidence_description": "Printed model text.",
    }

    unknown = {
        "attribute": "model",
        "value": None,
        "status": "unknown",
    }

    for candidates in (
        [unknown, observed],
        [observed, unknown],
    ):
        data, corrections = resolve_claim_set({
            "claims": candidates
        })

        model = next(
            claim for claim in data["claims"]
            if claim["attribute"] == "model"
        )

        assert model["value"] == "WH-1000XM4"
        assert model["status"] == "observed"

        event = next(
            correction for correction in corrections
            if correction["action"] == "resolved_duplicate_attribute"
        )

        assert len(event["original_claims"]) == 2


def test_conflicting_supported_models_remain_unknown():
    claims = [
        {
            "attribute": "model",
            "value": value,
            "status": "observed",
            "evidence_image": index,
            "evidence_description": "Printed model text.",
        }
        for index, value in enumerate(
            ["Model A", "Model B"]
        )
    ]

    data, _ = resolve_claim_set({
        "claims": claims
    })

    model = next(
        claim for claim in data["claims"]
        if claim["attribute"] == "model"
    )

    assert model["status"] == "unknown"
    assert model["value"] is None


# ============================================================
# DEFECT DEDUPLICATION TESTS
# ============================================================

def test_exact_duplicates_merge_without_losing_audit_photo():
    first = {
        "attribute": "defect",
        "value": "headband peeling",
        "status": "inferred",
        "evidence_image": 0,
        "evidence_description": "Peeling on the upper headband.",
    }

    second = dict(
        first,
        evidence_image=2,
    )

    raw = {
        "claims": [first, second]
    }

    original = copy.deepcopy(raw)

    data, corrections = resolve_claim_set(raw)

    # Original input must remain unchanged.
    assert raw == original

    assert sum(
        claim["attribute"] == "defect"
        for claim in data["claims"]
    ) == 1

    event = next(
        correction for correction in corrections
        if correction["action"] == "merged_duplicate_defect"
    )

    assert event["additional_claim"]["evidence_image"] == 2


def test_distinct_defects_are_preserved():
    claims = [
        {
            "attribute": "defect",
            "value": "scratch",
            "status": "inferred",
            "evidence_image": index,
            "evidence_description": (
                f"Scratch on the {side} earcup."
            ),
        }
        for index, side in enumerate(
            ["left", "right"]
        )
    ]

    data, _ = resolve_claim_set({
        "claims": claims
    })

    assert sum(
        claim["attribute"] == "defect"
        for claim in data["claims"]
    ) == 2


# ============================================================
# SAFETY AND PROVENANCE TESTS
# ============================================================

def test_port_proposal_does_not_automatically_become_confirmed(
    monkeypatch,
):
    result = _mock_analysis(
        monkeypatch,
        [
            {
                "attribute": "defect",
                "value": "charging-port damage",
                "status": "observed",
                "evidence_image": 1,
                "evidence_description": (
                    "Possible crack or debris at the charging port."
                ),
            }
        ],
        category="smartphone",
    )

    defect = next(
        claim for claim in result.claims
        if claim.attribute == "defect"
    )

    assert defect.status == "inferred"
    assert vision.viewer_defects(result) == []


def test_model_generated_confirmation_is_rejected(monkeypatch):
    # Seller-confirmed must not appear in Ollama's output contract.
    assert "seller_confirmed" not in json.dumps(
        vision._model_claim_schema()
    )

    with pytest.raises(ValueError, match="unauthorized"):
        _mock_analysis(
            monkeypatch,
            [
                {
                    "attribute": "defect",
                    "value": "headband peeling",
                    "status": "seller_confirmed",
                    "evidence_image": 2,
                    "evidence_description": PEELING,
                }
            ],
        )


# ============================================================
# SELLER CONFIRMATION TESTS
# ============================================================

def test_acceptance_and_rejection_have_distinct_outcomes(
    monkeypatch,
    review_events,
):
    result = _mock_analysis(
        monkeypatch,
        [_condition(PEELING, evidence_image=2)],
    )

    accepted = vision.confirm_claims(
        result,
        accepted=[1],
    )

    defect = next(
        claim for claim in accepted.claims
        if claim.attribute == "defect"
    )

    assert defect.status == "seller_confirmed"
    assert defect.evidence_description == PEELING

    markers = vision.viewer_defects(accepted)

    assert len(markers) == 1
    assert markers[0]["affected_area"] == "headband"

    rejected = vision.confirm_claims(
        result,
        accepted=[],
    )

    assert not any(
        claim.attribute == "defect"
        for claim in rejected.claims
    )

    assert vision.viewer_defects(rejected) == []


def test_invalid_confirmation_numbers_are_rejected(
    monkeypatch,
    review_events,
):
    result = _mock_analysis(
        monkeypatch,
        [_condition(PEELING, evidence_image=2)],
    )

    with pytest.raises(ValueError):
        vision.confirm_claims(
            result,
            accepted=[99],
        )

    with pytest.raises(ValueError):
        vision.confirm_claims(
            result,
            accepted=[1, 1],
        )

    # Invalid requests must not create review events.
    assert review_events == []


# ============================================================
# MANUAL SELLER CORRECTION TESTS
# ============================================================

def test_seller_can_supply_unknown_model_and_condition(
    monkeypatch,
    review_events,
):
    result = _mock_analysis(
        monkeypatch,
        [
            {
                "attribute": "model",
                "value": None,
                "status": "unknown",
                "uncertainty_reason": "Unreadable model.",
            }
        ],
    )

    result = vision.set_seller_claim(
        result,
        attribute="model",
        value="WH-1000XM4",
        image_count=3,
    )

    result = vision.set_seller_claim(
        result,
        attribute="condition",
        value="worn",
        image_count=3,
    )

    model = next(
        claim for claim in result.claims
        if claim.attribute == "model"
    )

    condition = next(
        claim for claim in result.claims
        if claim.attribute == "condition"
    )

    assert model.value == "WH-1000XM4"
    assert condition.value == "worn"

    assert model.status == "seller_confirmed"
    assert condition.status == "seller_confirmed"


def test_seller_added_defect_reaches_viewer(
    monkeypatch,
    review_events,
):
    result = _mock_analysis(
        monkeypatch,
        [],
    )

    updated = vision.set_seller_claim(
        result,
        attribute="defect",
        value="Headband peeling",
        image_count=3,
        evidence_image=2,
    )

    defects = vision.viewer_defects(updated)

    assert len(defects) == 1

    assert defects[0]["affected_area"] == "headband"
    assert defects[0]["evidence_image"] == 2
    assert defects[0]["verification_status"] == "seller_confirmed"


# ============================================================
# AUDIT LOGGING TESTS
# ============================================================

def test_raw_and_normalized_audit_events_are_available(
    monkeypatch,
    capsys,
):
    _mock_analysis(
        monkeypatch,
        [_condition(PEELING, evidence_image=2)],
    )

    output = capsys.readouterr().out

    events = [
        json.loads(line)
        for line in output.splitlines()
        if line.startswith("{") and '"event"' in line
    ]

    raw = next(
        event for event in events
        if event["event"] == "vision_claims_raw"
    )

    normalized = next(
        event for event in events
        if event["event"] == "vision_claims_normalized"
    )

    assert PEELING in raw["raw_output"]

    assert any(
        correction["action"] == "extracted_defect_from_condition"
        and correction["original_claim"]["evidence_description"] == PEELING
        for correction in normalized["corrections"]
    )


def test_review_decisions_are_logged(
    monkeypatch,
    review_events,
):
    result = _mock_analysis(
        monkeypatch,
        [
            _condition(PEELING, evidence_image=2),
            _condition(SCRATCH, evidence_image=1),
        ],
    )

    vision.confirm_claims(
        result,
        accepted=[1],
    )

    assert [
        event[2] for event in review_events
    ] == ["accepted", "rejected"]
def _raw_claim(attribute, value, status="inferred", image=0):
    return {
        "attribute": attribute,
        "value": value,
        "status": status,
        "evidence_image": image,
        "evidence_description": "Description supplied by the model.",
        "uncertainty_reason": None,
    }


@pytest.mark.parametrize("value", [
    "unknown",
    " UNKNOWN. ",
    "n/a",
    "N_A",
    "none",
    "null",
    "not applicable",
    "unspecified",
    "???",
])
@pytest.mark.parametrize("attribute", ["condition", "defect"])
def test_placeholder_values_become_unknown(attribute, value):
    raw = {"claims": [_raw_claim(attribute, value)]}
    original = copy.deepcopy(raw)

    data, corrections = normalize_claims(raw)
    claim = data["claims"][0]

    assert claim["status"] == "unknown"
    assert claim["value"] is None
    assert claim["evidence_image"] is None
    assert claim["evidence_description"] is None

    assert raw == original
    assert corrections[0]["action"] == "downgraded_placeholder_value"
    assert corrections[0]["original_claim"] == original["claims"][0]


@pytest.mark.parametrize("value", [
    "possible headband peeling",
    "unknown cause of headband peeling",
    "small scratch; extent unknown",
])
def test_meaningful_uncertain_defects_are_preserved(value):
    claim = _raw_claim("defect", value)
    claim["evidence_description"] = (
        "Possible peeling on the upper headband; severity is uncertain."
    )
    raw = {"claims": [claim]}

    data, corrections = normalize_claims(raw)

    assert data == raw
    assert corrections == []


def test_unknown_defect_does_not_reach_proposal_list():
    data, _ = normalize_claims({
        "claims": [_raw_claim("defect", "unknown")]
    })
    result = VisionResult(
        claims=[Claim.model_validate(data["claims"][0])],
        next_action="continue",
        question=None,
    )

    assert vision.proposal_list(result) == []


def test_ai_exact_model_identification_requires_confirmation():
    original = _raw_claim(
        "model", "Example Model 14", status="observed"
    )
    original["evidence_description"] = "The shape resembles this model."

    data, corrections = normalize_claims({"claims": [original]})
    model = data["claims"][0]

    assert model["value"] == "Example Model 14"
    assert model["status"] == "inferred"
    assert model["evidence_description"] == original["evidence_description"]
    assert "seller confirmation required" in model["uncertainty_reason"]
    assert corrections[0]["original_claim"]["status"] == "observed"


def test_model_status_cap_does_not_relax_missing_evidence():
    data, _ = normalize_claims({
        "claims": [
            _raw_claim("model", "Example Model", "observed", image=None)
        ]
    })
    assert data["claims"][0]["status"] == "unknown"


def test_invalid_model_image_is_still_rejected():
    data, _ = normalize_claims({
        "claims": [
            _raw_claim("model", "Example Model", "observed", image=4)
        ]
    })
    data, _ = sanitize_evidence(data, image_count=2)

    assert data["claims"][0]["status"] == "unknown"
    assert data["claims"][0]["value"] is None


def test_seller_confirmed_identity_is_not_downgraded():
    raw = {
        "claims": [
            _raw_claim("model", "Seller supplied model", "seller_confirmed")
        ]
    }
    data, corrections = normalize_claims(raw)

    assert data == raw
    assert corrections == []


@pytest.mark.parametrize("status", [
    "observed", "inferred", "seller_confirmed",
])
def test_schema_rejects_placeholder_supported_values(status):
    with pytest.raises(ValidationError, match="Placeholder"):
        Claim(**_raw_claim("defect", "n/a", status))


def test_mocked_output_cannot_offer_unknown_defect(monkeypatch):
    payload = {
        "claims": [
            _raw_claim("model", "Example Model 14", "observed"),
            _raw_claim("condition", "unknown"),
            _raw_claim("defect", "unknown"),
        ],
        "next_action": "continue",
        "question": None,
    }
    calls = []

    def fake_chat(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            message=SimpleNamespace(content=json.dumps(payload))
        )

    monkeypatch.setattr(vision, "chat", fake_chat)

    result = vision._analyze_claims_sync(["photo-0"], GENERIC)

    assert len(calls) == 1
    assert vision.proposal_list(result) == []
    assert next(
        claim for claim in result.claims if claim.attribute == "model"
    ).status == "inferred"
    assert next(
        claim for claim in result.claims if claim.attribute == "condition"
    ).value is None
    assert next(
        claim for claim in result.claims if claim.attribute == "defect"
    ).value is None