from pydantic import BaseModel

from schemas.photo_coverage import PhotoCoverage
from services.category_profiles import CategoryProfile


class CoverageDecision(BaseModel):
    allowed_to_list: bool
    category_profile: str
    missing_views: list[str]
    quality_issues: list[str] = []
    next_photo_request: str | None


def validate_photo_coverage(
    coverage: PhotoCoverage,
    profile: CategoryProfile,
) -> CoverageDecision:
    missing = sorted(profile.required_views - set(coverage.visible_views))
    issues = list(coverage.image_quality_issues)

    if issues or missing:
        parts = []
        if issues:
            parts.append("Some photos have quality problems: " + "; ".join(issues) + ".")
        if missing:
            parts.append("Please upload photos showing: " + ", ".join(missing) + ".")
        return CoverageDecision(
            allowed_to_list=False,
            category_profile=profile.name,
            missing_views=missing,
            quality_issues=issues,
            next_photo_request=" ".join(parts),
        )

    return CoverageDecision(
        allowed_to_list=True,
        category_profile=profile.name,
        missing_views=[],
        next_photo_request=None,
    )