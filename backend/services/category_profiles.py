import re
from dataclasses import dataclass


@dataclass(frozen=True)
class CategoryProfile:
    name: str
    aliases: tuple[str, ...]
    required_views: frozenset[str]
    inspect: str            # what to look at for condition
    identifier_hint: str    # completes "Can you photograph ___?"


def _p(name, aliases, views, inspect, hint):
    return CategoryProfile(name, tuple(aliases), frozenset(views), inspect, hint)


# Used for any category without its own entry. Deliberately conservative.
GENERIC = _p(
    "generic_electronics", [],
    {"front", "back", "top", "bottom", "side"},
    "screens or displays, casing, corners and edges, buttons, ports, and cables",
    "the model or regulatory label (usually on the back or underside), "
    "or a Settings/About screen if it has one",
)


PROFILES = [
    _p("headphones", ["headphone", "earphone", "earbud", "airpod", "headset"],
       {"front", "back", "top", "earcups"},
       "the headband, earcups, padding, hinges, and cable or charging port",
       "the model-number label (often inside the headband or on an earcup)"),
    _p("smartwatch", ["smartwatch", "smart watch", "apple watch", "fitness tracker"],
       {"front", "back", "side"},
       "the screen, case, crown or buttons, back sensors, and band",
       "the model text on the back of the case, or the Settings > About screen"),
    _p("controller", ["controller", "gamepad", "joystick"],
       {"front", "back", "top", "ports"},
       "the sticks, buttons, triggers, shell, and charging port",
       "the model label inside the battery bay or on the back"),
    _p("game_console", ["console", "playstation", "xbox", "nintendo switch"],
       {"front", "back", "ports", "top"},
       "the casing, vents, ports, disc drive, and scratches",
       "the model label on the underside or back"),
    _p("smartphone", ["smartphone", "iphone", "cell phone", "mobile phone", "phone"],
       {"front", "back", "top", "bottom", "side"},
       "the screen, back glass, camera lenses, frame edges, corners, and charging port",
       "the Settings > General > About screen, or the model text on the back"),
    _p("tablet", ["tablet", "ipad"],
       {"front", "back", "side", "bottom"},
       "the screen, back, frame edges, corners, and charging port",
       "the Settings > About screen, or the model text on the back"),
    _p("laptop", ["laptop", "macbook", "chromebook"],
       {"top", "screen", "keyboard", "ports", "bottom"},
       "the lid, screen, keyboard, trackpad, hinges, ports, and underside",
       "the label on the underside, or the About/System screen"),
    _p("camera", ["camera", "camcorder", "gopro"],
       {"front", "back", "top", "lens", "side"},
       "the lens, body, screen, buttons, ports, and battery door",
       "the model text on the body or the label under the battery door"),
    _p("speaker", ["speaker", "soundbar"],
       {"front", "back", "top", "ports"},
       "the grille, casing, buttons, ports, and cable",
       "the model label on the underside or back"),
]


def match_profile(category: str | None) -> CategoryProfile:
    """Map the model's free-text category to a profile. Word boundaries keep
    'headphones' from matching 'phone'."""
    text = (category or "").lower()
    for profile in PROFILES:
        for alias in profile.aliases:
            if re.search(rf"\b{re.escape(alias)}s?\b", text):
                return profile
    return GENERIC