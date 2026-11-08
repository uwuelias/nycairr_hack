
from typing import Literal
from services.identifier_check import require_proposal_confirmation
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

Attribute = Literal[
    "category",
    "brand",
    "model",
    "color",
    "condition",
    "defect",
    "accessories",
    "functionality",
    "authenticity",
]

Status = Literal[
    "observed",
    "inferred",
    "unknown",
    "requires_user_confirmation",
]

NextAction = Literal[
    "continue",
    "request_more_information",
    "request_user_confirmation",
]


class Claim(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attribute: Attribute
    value: str | None = None
    status: Status

    evidence_image: int | None = Field(default=None, ge=0)
    evidence_description: str | None = None

    # Explanation for unknown or unconfirmed claims.
    uncertainty_reason: str | None = None

    @model_validator(mode="after")
    
    def check_provenance(self):
        if self.status in ("observed", "inferred"):
            if not self.value or not self.value.strip():
                raise ValueError("Observed/inferred claims require a value.")

            if not self.evidence_description or not self.evidence_description.strip():
                raise ValueError("Observed/inferred claims require evidence.")

            if self.status == "observed" and self.evidence_image is None:
                raise ValueError("Observed claims require an image index.")

        else:  # unknown / requires_user_confirmation
            if self.value is not None:
                raise ValueError("Unknown/unconfirmed claims must have null value.")

            if self.evidence_image is not None:
                raise ValueError(
                    "Unknown/unconfirmed claims cannot have a supporting image index."
                )

        return self



class VisionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claims: list[Claim] = Field(min_length=1)

    next_action: NextAction

    question: str | None = None

    @model_validator(mode="after")
    def validate_next_action(self):
        if self.next_action == "continue":
            if self.question is not None:
                raise ValueError(
                    "Question must be null when continuing."
                )
        elif not self.question or not self.question.strip():
            raise ValueError(
                "A clarification question is required."
            )

        return self

def test_defect_and_color_capped_at_inferred():
    raw = {"claims": [
        {"attribute": "defect", "value": "scratch", "status": "observed",
         "evidence_image": 0, "evidence_description": "diagonal scratch"},
        {"attribute": "color", "value": "black", "status": "observed",
         "evidence_image": 0, "evidence_description": "black casing"},
        {"attribute": "brand", "value": "Sony", "status": "observed",
         "evidence_image": 0, "evidence_description": "SONY printed"},
    ]}
    data, log = require_proposal_confirmation(raw)
    statuses = [c["status"] for c in data["claims"]]
    assert statuses == ["inferred", "inferred", "observed"]
    assert len(log) == 2


def _review_result():
    return VisionResult(claims=[
        Claim(attribute="model", value="iPhone 13 Pro", status="observed",
              evidence_image=0, evidence_description="Seller confirmed."),
        Claim(attribute="defect", value="cracked bottom edge", status="inferred",
              evidence_image=3, evidence_description="crack near port"),
        Claim(attribute="defect", value="broken SIM tray", status="inferred",
              evidence_image=4, evidence_description="tray damaged"),
        Claim(attribute="color", value="Silver", status="inferred",
              evidence_image=0, evidence_description="silver finish"),
    ], next_action="continue", question=None)


def test_review_question_lists_proposals():
    updated, _ = enforce_next_action(_review_result(), GENERIC)
    assert updated.next_action == "request_user_confirmation"
    assert "cracked bottom edge" in updated.question
    assert "broken SIM tray" in updated.question


def test_rejecting_everything_drops_defects_and_unknowns_color():
    result = confirm_claims(_review_result(), accepted=[])
    assert not any(c.attribute == "defect" for c in result.claims)
    color = next(c for c in result.claims if c.attribute == "color")
    assert color.status == "unknown"


def test_accepted_defect_becomes_observed():
    result = confirm_claims(_review_result(), accepted=[1])
    defects = [c for c in result.claims if c.attribute == "defect"]
    assert len(defects) == 1
    assert defects[0].status == "observed"
    assert defects[0].value == "cracked bottom edge"