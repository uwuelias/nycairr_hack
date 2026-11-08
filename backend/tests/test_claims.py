import pytest
from pydantic import ValidationError
from services.ocr_check import text_corroborated
from schemas.photo_coverage import PhotoCoverage
from services.category_profiles import GENERIC, match_profile
from services.claim_normalization import enforce_unverifiable
from services.photo_validation import validate_photo_coverage
from schemas.claims import Claim
from services.claim_normalization import (
    REQUIRED_ATTRIBUTES,
    resolve_claim_set,
    sanitize_evidence,
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