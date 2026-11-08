import pytest

from services import run_logging


@pytest.fixture(autouse=True)
def isolate_review_log(tmp_path, monkeypatch):
    """Keep test decisions out of the real evaluation/reviews.jsonl."""
    monkeypatch.setattr(run_logging, "REVIEW_LOG", tmp_path / "reviews.jsonl")