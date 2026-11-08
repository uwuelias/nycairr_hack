"""Tests for per-photo coverage analysis. Ollama is mocked: no model runs."""
import asyncio
import json
from types import SimpleNamespace
from typing import get_args

import pytest

from agents import vision_agent
from agents.vision_agent import (
    _aggregate_coverage,
    _analyze_coverage_sync,
    _resolve_category,
    analyze_product,
)
from schemas.claims import Claim, VisionResult
from schemas.photo_coverage import PhotoCoverage, PhotoView
from services.category_profiles import GENERIC, match_profile
from services.photo_validation import CoverageDecision, validate_photo_coverage


# ---- Helpers ----

def _photo(category, views, issues=None, missing=("front",), sufficient=True):
    """One per-photo model response.

    missing_views and coverage_sufficient default to deliberately wrong values
    so the tests prove the code never trusts the model's self-reports.
    """
    return {
        "product_category": category,
        "visible_views": list(views),
        "missing_views": list(missing),
        "image_quality_issues": list(issues or []),
        "coverage_sufficient": sufficient,
    }


@pytest.fixture
def mock_ollama(monkeypatch):
    """Replace vision_agent.chat with a fake keyed by the image path.

    Returns install(responses) -> calls, where `calls` records the `images`
    list of every request. A response may be a dict (serialized to JSON) or a
    raw string (to simulate malformed model output).
    """
    def install(responses):
        calls = []

        def fake_chat(**kwargs):
            images = kwargs["messages"][1]["images"]
            calls.append(images)
            payload = responses[images[0]]
            content = payload if isinstance(payload, str) else json.dumps(payload)
            return SimpleNamespace(message=SimpleNamespace(content=content))

        monkeypatch.setattr(vision_agent, "chat", fake_chat)
        return calls

    return install


def _canonical(views):
    return [v for v in get_args(PhotoView) if v in set(views)]


# Five iPhone photos. The back photo carries the exact bad self-report seen in
# testing (claims "back" is missing and coverage is insufficient).
IPHONE = {
    "front.jpg": _photo("smartphone", ["front", "screen"]),
    "back.jpg": _photo("smartphone", ["back", "lens"],
                       missing=["back"], sufficient=False),
    "top.jpg": _photo("smartphone", ["top", "side"]),
    "bottom.jpg": _photo("smartphone", ["ports", "bottom"]),
    "side.jpg": _photo("iPhone", ["side"]),
}
IPHONE_VIEWS = {"front", "screen", "back", "lens", "top", "side", "ports", "bottom"}


# ---- Per-photo calls ----

def test_each_photo_is_sent_in_its_own_call(mock_ollama):
    calls = mock_ollama(IPHONE)
    paths = list(IPHONE)

    _analyze_coverage_sync(paths)

    assert calls == [[p] for p in paths]


def test_single_photo_keeps_its_category_and_views(mock_ollama):
    mock_ollama({"a.jpg": _photo("headphones", ["front", "earcups"])})

    cov = _analyze_coverage_sync(["a.jpg"])

    assert cov.product_category == "headphones"
    assert cov.visible_views == ["front", "earcups"]


# ---- Regression: five iPhone photos ----

@pytest.mark.parametrize("order", [
    [0, 1, 2, 3, 4],
    [4, 3, 2, 1, 0],
    [2, 0, 4, 1, 3],
])
def test_five_iphone_photos_detect_bottom_in_any_order(mock_ollama, order):
    mock_ollama(IPHONE)
    paths = [list(IPHONE)[i] for i in order]

    cov = _analyze_coverage_sync(paths)

    assert "bottom" in cov.visible_views
    assert set(cov.visible_views) == IPHONE_VIEWS
    assert cov.visible_views == _canonical(IPHONE_VIEWS)
    assert cov.product_category == "smartphone"
    assert cov.missing_views == []

    decision = validate_photo_coverage(cov, match_profile(cov.product_category))
    assert decision.allowed_to_list
    assert "back" not in decision.missing_views


def test_visible_views_are_deduplicated(mock_ollama):
    mock_ollama({
        "a.jpg": _photo("smartphone", ["front", "ports"]),
        "b.jpg": _photo("smartphone", ["front", "ports", "bottom"]),
    })

    cov = _analyze_coverage_sync(["a.jpg", "b.jpg"])

    assert cov.visible_views == ["front", "bottom", "ports"]
    assert len(cov.visible_views) == len(set(cov.visible_views))


# ---- Model self-reports are not trusted ----

def test_model_missing_views_and_sufficiency_are_ignored(mock_ollama):
    # The model claims "front" is missing and coverage is sufficient.
    mock_ollama({"top.jpg": _photo("laptop", ["top"])})

    cov = _analyze_coverage_sync(["top.jpg"])

    assert set(cov.missing_views) == {"screen", "keyboard", "ports", "bottom"}
    assert "front" not in cov.missing_views
    assert cov.coverage_sufficient is False


# ---- Category resolution ----

@pytest.mark.parametrize("guesses, expected", [
    # unanimous (same profile, different wording): first-seen wording wins ties
    (["iPhone", "smartphone", "iphone 15"], "iPhone"),
    # strict majority beats an outlier
    (["smartphone", "smartphone", "camera"], "smartphone"),
    # most common wording within the winning profile
    (["iPhone", "smartphone", "smartphone"], "smartphone"),
    # unrecognized guesses abstain instead of diluting the vote
    (["smartphone", "charging port", "usb port"], "smartphone"),
    # no strict majority among specific profiles -> unknown
    (["smartphone", "camera"], ""),
    (["smartphone", "smartphone", "camera", "camera"], ""),
    (["laptop", "camera", "tablet"], ""),
    # nothing recognizable
    (["charging port", "usb cable"], ""),
    (["", "  "], ""),
    ([], ""),
    # unanimous unrecognized category is kept (maps to GENERIC)
    (["robot vacuum", "Robot Vacuum"], "robot vacuum"),
])
def test_resolve_category(guesses, expected):
    assert _resolve_category(guesses) == expected


def test_disagreeing_categories_fall_back_to_generic_profile(mock_ollama):
    mock_ollama({
        "a.jpg": _photo("laptop", ["top", "screen"]),
        "b.jpg": _photo("camera", ["front", "lens"]),
    })

    cov = _analyze_coverage_sync(["a.jpg", "b.jpg"])

    assert cov.product_category == ""
    assert match_profile(cov.product_category) is GENERIC
    # GENERIC demands the five physical sides, so listing is blocked.
    assert not validate_photo_coverage(cov, GENERIC).allowed_to_list


# ---- Image-quality issues ----

def test_quality_issues_are_preserved_with_photo_number(mock_ollama):
    mock_ollama({
        "a.jpg": _photo("smartphone", ["front"]),
        "b.jpg": _photo("smartphone", ["bottom"],
                        issues=["blurry", "blurry", "  ", "glare on screen"]),
        "c.jpg": _photo("smartphone", ["back"], issues=["blurry"]),
    })

    cov = _analyze_coverage_sync(["a.jpg", "b.jpg", "c.jpg"])

    assert cov.image_quality_issues == [
        "Photo 2: blurry",
        "Photo 2: glare on screen",
        "Photo 3: blurry",
    ]
    decision = validate_photo_coverage(cov, match_profile(cov.product_category))
    assert not decision.allowed_to_list
    assert "Photo 2: blurry" in decision.next_photo_request


# ---- Malformed model output ----

@pytest.mark.parametrize("bad", [
    "this is not json",
    json.dumps(_photo("smartphone", ["bottom_edge"])),  # not a PhotoView
])
def test_unparseable_photo_becomes_quality_issue(mock_ollama, bad):
    mock_ollama({
        "a.jpg": _photo("smartphone", ["front"]),
        "b.jpg": bad,
    })

    cov = _analyze_coverage_sync(["a.jpg", "b.jpg"])

    assert cov.visible_views == ["front"]  # the good photo still counts
    assert cov.image_quality_issues == [
        "Photo 2: could not be analyzed; please re-upload or retake it."
    ]
    decision = validate_photo_coverage(cov, match_profile(cov.product_category))
    assert not decision.allowed_to_list


# ---- Aggregation is pure and order independent ----

def test_aggregate_handles_empty_input():
    cov = _aggregate_coverage([])

    assert cov.visible_views == []
    assert cov.product_category == ""
    assert cov.coverage_sufficient is False


def test_aggregate_result_matches_schema():
    cov = _aggregate_coverage([PhotoCoverage(**_photo("laptop", ["top"]))])

    # Round-trips through the unchanged schema (extra="forbid").
    PhotoCoverage.model_validate(cov.model_dump())


# ---- Parallel mode ----

def test_parallel_workers_keep_photo_numbering(mock_ollama, monkeypatch):
    monkeypatch.setattr(vision_agent, "COVERAGE_MAX_WORKERS", 3)
    calls = mock_ollama({
        "a.jpg": _photo("smartphone", ["front"]),
        "b.jpg": _photo("smartphone", ["bottom"], issues=["blurry"]),
        "c.jpg": _photo("smartphone", ["back"]),
    })

    cov = _analyze_coverage_sync(["a.jpg", "b.jpg", "c.jpg"])

    assert sorted(calls) == [["a.jpg"], ["b.jpg"], ["c.jpg"]]
    assert cov.image_quality_issues == ["Photo 2: blurry"]
    assert cov.visible_views == ["front", "back", "bottom"]


# ---- analyze_product keeps its interface ----

def test_analyze_product_interface_is_unchanged(mock_ollama, monkeypatch, tmp_path):
    paths = []
    responses = {}
    for name, payload in IPHONE.items():
        file = tmp_path / name
        file.write_bytes(b"")
        resolved = str(file.resolve())  # _load_images returns resolved paths
        paths.append(str(file))
        responses[resolved] = payload
    calls = mock_ollama(responses)

    seen = {}

    def fake_claims(images, profile):
        seen["image_count"] = len(images)
        seen["profile"] = profile.name
        return VisionResult(
            claims=[Claim(
                attribute="defect", value="Scratch", status="inferred",
                evidence_image=0, evidence_description="Scratch visible.",
            )],
            next_action="continue",
            question=None,
        )

    monkeypatch.setattr(vision_agent, "_analyze_claims_sync", fake_claims)

    claims, decision = asyncio.run(analyze_product(paths))

    assert isinstance(claims, VisionResult)
    assert isinstance(decision, CoverageDecision)
    assert decision.allowed_to_list
    assert decision.category_profile == "smartphone"
    # Coverage: one call per photo. Claims: still one call with all photos.
    assert len(calls) == 5
    assert seen == {"image_count": 5, "profile": "smartphone"}