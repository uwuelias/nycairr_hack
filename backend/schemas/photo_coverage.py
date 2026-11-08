from typing import Literal

from pydantic import BaseModel, ConfigDict


PhotoView = Literal[
    "front", "back", "top", "bottom", "side",
    "ports", "screen", "keyboard", "lens", "earcups",
    "damage_closeup",
]


class PhotoCoverage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_category: str
    visible_views: list[PhotoView]
    missing_views: list[str]
    image_quality_issues: list[str]
    coverage_sufficient: bool
    next_photo_request: str | None = None