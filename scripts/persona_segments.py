"""Persona lever catalog and segment presets.

Single source of truth for the research-backed segment defaults that prepopulate
the UI's persona levers. The frontend mirrors a copy of this data for snappy
first paint, but the backend is canonical (served via /personas/* endpoints).

The runner still consumes the legacy 4-float behavior model
(``exploration / patience / attention / error_rate``). ``derive_behavior_floats``
maps lever levels into that model so the existing Playwright runner doesn't
need to change.

Sources cited by the levers / segments map to internal EG research:
- Explore 26 Traveler Segments
- Standout Stay Brand Lit Review
- VR Traveler Compendium
- Hcom Discovery Insights Playback
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Levels and conversion to the 0-1 float model the runner consumes.
# ---------------------------------------------------------------------------

LEVEL_FLOATS: dict[str, float] = {
    "low": 0.2,
    "low-medium": 0.35,
    "medium": 0.5,
    "medium-high": 0.65,
    "high": 0.8,
}

# Info processing is binary in the research, so we treat it as two ends of a
# continuous scale.
INFO_PROCESSING_FLOATS: dict[str, float] = {
    "skimmer": 0.2,
    "deep_reader": 0.8,
}


def _level_to_float(value: str | None, default: float = 0.5) -> float:
    if not value:
        return default
    if value in LEVEL_FLOATS:
        return LEVEL_FLOATS[value]
    if value in INFO_PROCESSING_FLOATS:
        return INFO_PROCESSING_FLOATS[value]
    return default


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def derive_behavior_floats(levers: dict[str, str]) -> dict[str, float]:
    """Translate lever levels into the legacy 4-float behavior model.

    The mapping is deliberately conservative — we want the resulting floats to
    feel reasonable for the runner's existing ``vary_behavior`` heuristic.
    """
    info = _level_to_float(levers.get("info_processing_style"), 0.5)
    time_pressure = _level_to_float(levers.get("time_pressure"), 0.5)
    cognitive = _level_to_float(levers.get("cognitive_load_sensitivity"), 0.5)
    abandonment = _level_to_float(levers.get("abandonment_threshold"), 0.5)
    err = _level_to_float(levers.get("error_propensity"), 0.5)

    exploration = 0.5 * info + 0.25 * (1 - time_pressure) + 0.25 * (1 - cognitive)
    patience = 0.5 * (1 - abandonment) + 0.5 * (1 - time_pressure)
    attention = 0.6 * info + 0.4 * (1 - cognitive)
    error_rate = err

    return {
        "exploration": round(_clamp(exploration), 2),
        "patience": round(_clamp(patience), 2),
        "attention": round(_clamp(attention), 2),
        "error_rate": round(_clamp(error_rate), 2),
    }


# ---------------------------------------------------------------------------
# Lever catalog.
# ---------------------------------------------------------------------------

_LEVEL_OPTIONS = [
    {"value": "low", "label": "Low"},
    {"value": "low-medium", "label": "Low-Medium"},
    {"value": "medium", "label": "Medium"},
    {"value": "medium-high", "label": "Medium-High"},
    {"value": "high", "label": "High"},
]

LEVER_DEFINITIONS: list[dict] = [
    {
        "id": "trust_baseline",
        "name": "Trust baseline",
        "summary": "How much the tester trusts the platform out of the gate.",
        "group": "risk_trust",
        "options": _LEVEL_OPTIONS,
    },
    {
        "id": "time_pressure",
        "name": "Time pressure",
        "summary": "How much hurry they're in. High = books in days, not weeks.",
        "group": "pressure",
        "options": _LEVEL_OPTIONS,
    },
    {
        "id": "info_processing_style",
        "name": "Info processing style",
        "summary": "Skimmer vs deep reader.",
        "group": "mindset",
        "options": [
            {"value": "skimmer", "label": "Skimmer"},
            {"value": "deep_reader", "label": "Deep reader"},
        ],
    },
    {
        "id": "risk_tolerance",
        "name": "Risk tolerance",
        "summary": "How willing to try unfamiliar or unverified options.",
        "group": "risk_trust",
        "options": _LEVEL_OPTIONS,
    },
    {
        "id": "cognitive_load_sensitivity",
        "name": "Cognitive load sensitivity",
        "summary": "How easily overwhelmed by complex flows or copy.",
        "group": "mindset",
        "options": _LEVEL_OPTIONS,
    },
    {
        "id": "error_propensity",
        "name": "Error propensity",
        "summary": "How likely to slip up, misclick, or skip steps.",
        "group": "risk_trust",
        "options": _LEVEL_OPTIONS,
    },
    {
        "id": "device_context",
        "name": "Device / context",
        "summary": "Where they're using the site from.",
        "group": "context",
        "options": [
            {"value": "desktop", "label": "Desktop"},
            {"value": "mobile", "label": "Mobile"},
            {"value": "mixed", "label": "Mixed"},
        ],
    },
    {
        "id": "budget_sensitivity",
        "name": "Budget sensitivity",
        "summary": "How price-conscious. High = chases deals; Low = pays for premium.",
        "group": "pressure",
        "options": _LEVEL_OPTIONS,
    },
    {
        "id": "abandonment_threshold",
        "name": "Abandonment threshold",
        "summary": "How quickly they bail when frustrated. Low = patient; High = bounces fast.",
        "group": "pressure",
        "options": _LEVEL_OPTIONS,
    },
    {
        "id": "prior_product_familiarity",
        "name": "Prior product familiarity",
        "summary": "How familiar they are with this kind of product.",
        "group": "mindset",
        "options": _LEVEL_OPTIONS,
    },
]


# ---------------------------------------------------------------------------
# Lever groups.
#
# The UI renders the 10 levers in four buckets so the persona editor doesn't
# read as a wall of dropdowns. Those buckets live here (not in the frontend)
# so the taxonomy the user sees matches what the API serves. Each lever's
# ``group`` id above points into this list.
# ---------------------------------------------------------------------------

LEVER_GROUPS: list[dict] = [
    {
        "id": "mindset",
        "name": "Mindset",
        "summary": "How the tester takes in and processes information.",
    },
    {
        "id": "pressure",
        "name": "Pressure",
        "summary": "Time, budget, and patience constraints.",
    },
    {
        "id": "risk_trust",
        "name": "Risk & trust",
        "summary": "How cautious or confident they are with the platform and the decision.",
    },
    {
        "id": "context",
        "name": "Context",
        "summary": "Where and how they're using the site.",
    },
]


# ---------------------------------------------------------------------------
# Lines of business (LOB).
#
# LOB is the structural axis the Glean prompt expects every segment to live
# under. Step A of the LOB-first migration: introduce the taxonomy and tag
# every existing preset. Filtering, UI, and segment expansion follow in later
# steps.
# ---------------------------------------------------------------------------

LOBS: list[dict] = [
    {
        "id": "expedia",
        "name": "Expedia",
        "summary": "Multi-product OTA — packages, flights, hotels, cars, activities.",
    },
    {
        "id": "hotels_com",
        "name": "Hotels.com",
        "summary": "Hotel-focused, deal-and-rewards lens.",
    },
    {
        "id": "vrbo",
        "name": "Vrbo",
        "summary": "Whole-home vacation rentals; group / family travel.",
    },
    {
        "id": "b2b_network",
        "name": "B2B Network",
        "summary": "Partner-facing distribution and tooling.",
    },
    {
        "id": "partner_central",
        "name": "Partner Central",
        "summary": "Property-side console for hotel / VR partners.",
    },
]


# ---------------------------------------------------------------------------
# Segment presets — research-backed lever defaults.
#
# Fields per record:
#   - id / name / lob / brand: structural identity
#   - summary / research_notes: human copy
#   - levers: the 10-lever descriptive profile (Low/Medium/High etc.)
#   - is_primary: True only for the brand's "headpin" segment. Used by the UI
#     to mark it and to seed the default tester list when a LOB is picked.
#   - scope: "brand" for segments owned by a single brand; "cross_brand" for
#     segments (Gen Z, High Value) that appear under every brand pill. Cross-
#     brand rows have lob="" and are returned in addition to brand segments
#     by get_segments_for_lob().
#   - confidence: "high" | "medium" | "low". Reflects Marketing/UXR/Analytics
#     alignment AND, for newer agent-drafted lever mappings, the trust level
#     the values should be read at. Anything medium/low should be reviewed
#     before leaning on it for directional conclusions.
# ---------------------------------------------------------------------------

SEGMENT_PRESETS: list[dict] = [
    # ----------------------- Brand Expedia (BEX) ---------------------------
    {
        "id": "quality_seeker",
        "name": "Quality Seeker",
        "lob": "expedia",
        "brand": "Expedia",
        "is_primary": True,
        "scope": "brand",
        "confidence": "high",
        "summary": "Trusted-advisor expectations, deep planner, pays for premium.",
        "research_notes": "Books ~60 days out · ~6.9 trips/yr · loyalty member · ~$6,100/yr spend.",
        "levers": {
            "trust_baseline": "high",
            "time_pressure": "low",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "medium-high",
            "cognitive_load_sensitivity": "low-medium",
            "error_propensity": "low",
            "device_context": "desktop",
            "budget_sensitivity": "low",
            "abandonment_threshold": "low",
            "prior_product_familiarity": "high",
        },
    },
    {
        "id": "family_traveler",
        "name": "Family Traveler",
        "lob": "expedia",
        "brand": "Expedia",
        "is_primary": False,
        "scope": "brand",
        "confidence": "high",
        "summary": "1+ child plus 1+ adult. Plans deeply, anxious about getting it right, hunts deals.",
        "research_notes": "Well-defined across Marketing, UXR, and Analytics · plans 3-6 months ahead · budget-conscious.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "low",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "low",
            "cognitive_load_sensitivity": "high",
            "error_propensity": "medium",
            "device_context": "desktop",
            "budget_sensitivity": "high",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "medium",
        },
    },
    {
        "id": "couple_traveler",
        "name": "Couple Traveler",
        "lob": "expedia",
        "brand": "Expedia",
        "is_primary": False,
        "scope": "brand",
        "confidence": "medium",
        "summary": "Two adults, no children. Flexible, more spontaneous than family travelers.",
        "research_notes": "Defined behaviorally · stronger in analytics than qualitative depth. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium-high",
            "time_pressure": "medium",
            "info_processing_style": "skimmer",
            "risk_tolerance": "medium-high",
            "cognitive_load_sensitivity": "medium",
            "error_propensity": "low-medium",
            "device_context": "mixed",
            "budget_sensitivity": "medium",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "medium-high",
        },
    },
    {
        "id": "latinx_traveler",
        "name": "Latinx Traveler",
        "lob": "expedia",
        "brand": "Expedia",
        "is_primary": False,
        "scope": "brand",
        "confidence": "low",
        "summary": "US Latino Quality Seekers. Similar headpin profile to QS with distinct cultural and media patterns.",
        "research_notes": "Marketing-defined · significant gaps in UXR and Analytics alignment. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium-high",
            "time_pressure": "low-medium",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "medium",
            "cognitive_load_sensitivity": "medium",
            "error_propensity": "low",
            "device_context": "mixed",
            "budget_sensitivity": "medium",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "medium",
        },
    },

    # ------------------------------- Vrbo ----------------------------------
    {
        "id": "group_planner",
        "name": "Group Planner",
        "lob": "vrbo",
        "brand": "Vrbo",
        "is_primary": True,
        "scope": "brand",
        "confidence": "medium",
        "summary": "Umbrella Vrbo planner. Coordinates for a group, reads deeply, sensitive to fees and policies.",
        "research_notes": "Strongest clarity on group size and stay length · fuzziest on who in the group is the planner. Umbrella lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "low-medium",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "low-medium",
            "cognitive_load_sensitivity": "medium",
            "error_propensity": "medium",
            "device_context": "desktop",
            "budget_sensitivity": "medium",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "medium",
        },
    },
    {
        "id": "complex_family_planner",
        "name": "Complex Family Planner",
        "lob": "vrbo",
        "brand": "Vrbo",
        "is_primary": False,
        "scope": "brand",
        "confidence": "high",
        "summary": "Multi-household family trips (kids + grandparents). Deep researcher, sensitive to fees and policies.",
        "research_notes": "Strong qualitative definition · analytics definition exists but is still evolving. Plans 2-3+ months ahead.",
        "levers": {
            "trust_baseline": "low-medium",
            "time_pressure": "low-medium",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "low",
            "cognitive_load_sensitivity": "medium",
            "error_propensity": "medium",
            "device_context": "desktop",
            "budget_sensitivity": "medium",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "medium",
        },
    },
    {
        "id": "large_group_planner",
        "name": "Large Group Planner",
        "lob": "vrbo",
        "brand": "Vrbo",
        "is_primary": False,
        "scope": "brand",
        "confidence": "medium",
        "summary": "4-5+ adults, friend-group trips. Coordinates schedules and bed counts across many decision-makers.",
        "research_notes": "Planner role clear qualitatively · harder to isolate 'planner' in data. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "medium",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "medium",
            "cognitive_load_sensitivity": "medium",
            "error_propensity": "medium",
            "device_context": "desktop",
            "budget_sensitivity": "medium-high",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "medium",
        },
    },
    {
        "id": "long_stay_traveler",
        "name": "Long-Stay Traveler",
        "lob": "vrbo",
        "brand": "Vrbo",
        "is_primary": False,
        "scope": "brand",
        "confidence": "medium",
        "summary": "28-30+ day stays for temp work, housing transitions, or extended leisure. High financial commitment.",
        "research_notes": "Operationally identifiable · emerging as a segment. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "low",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "low",
            "cognitive_load_sensitivity": "medium",
            "error_propensity": "low",
            "device_context": "desktop",
            "budget_sensitivity": "high",
            "abandonment_threshold": "low",
            "prior_product_familiarity": "medium",
        },
    },
    {
        "id": "weekend_getaway",
        "name": "Weekend Getaway",
        "lob": "vrbo",
        "brand": "Vrbo",
        "is_primary": False,
        "scope": "brand",
        "confidence": "medium",
        "summary": "Last-minute short stays, mobile-first. Often new to VR; price-clarity-driven.",
        "research_notes": "Present in UXR and Analytics, less formalized as a 'planner' segment · ≤4-day booking windows · cross-shops hotels.",
        "levers": {
            "trust_baseline": "low",
            "time_pressure": "high",
            "info_processing_style": "skimmer",
            "risk_tolerance": "medium",
            "cognitive_load_sensitivity": "high",
            "error_propensity": "medium-high",
            "device_context": "mobile",
            "budget_sensitivity": "high",
            "abandonment_threshold": "high",
            "prior_product_familiarity": "low",
        },
    },

    # ----------------------------- Hotels.com ------------------------------
    {
        "id": "savvy_trip_taker",
        "name": "Savvy Trip Taker",
        "lob": "hotels_com",
        "brand": "Hotels.com",
        "is_primary": True,
        "scope": "brand",
        "confidence": "medium",
        "summary": "Deal-hunter on the go, quick decisions, bounces if confused.",
        "research_notes": "Strong in Marketing & UXR · not consistently defined in Analytics. 30% book within 3 days · ~10% lower ADR than Expedia · 9 trips/yr.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "high",
            "info_processing_style": "skimmer",
            "risk_tolerance": "medium",
            "cognitive_load_sensitivity": "medium-high",
            "error_propensity": "medium",
            "device_context": "mobile",
            "budget_sensitivity": "medium-high",
            "abandonment_threshold": "medium-high",
            "prior_product_familiarity": "high",
        },
    },
    {
        "id": "unmanaged_business_traveler",
        "name": "Unmanaged Business Traveler",
        "lob": "hotels_com",
        "brand": "Hotels.com",
        "is_primary": False,
        "scope": "brand",
        "confidence": "medium",
        "summary": "Self-booking business traveler (non-TMC). Risk-averse, time-pressured, prefers known brands.",
        "research_notes": "Qualitatively well-defined · Analytics relies on proxies (single occupancy, no Saturday-night stay). Books <30 days · cancels ~35% less.",
        "levers": {
            "trust_baseline": "medium-high",
            "time_pressure": "high",
            "info_processing_style": "skimmer",
            "risk_tolerance": "low-medium",
            "cognitive_load_sensitivity": "high",
            "error_propensity": "medium",
            "device_context": "mixed",
            "budget_sensitivity": "medium",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "high",
        },
    },
    {
        "id": "last_minute_booker",
        "name": "Last-minute Booker",
        "lob": "hotels_com",
        "brand": "Hotels.com",
        "is_primary": False,
        "scope": "brand",
        "confidence": "low",
        "summary": "Same-day or next-day booking. Operationally identifiable; less of a distinct persona.",
        "research_notes": "Operationally identifiable in data · less of a distinct persona. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "low-medium",
            "time_pressure": "high",
            "info_processing_style": "skimmer",
            "risk_tolerance": "medium",
            "cognitive_load_sensitivity": "high",
            "error_propensity": "medium-high",
            "device_context": "mobile",
            "budget_sensitivity": "medium",
            "abandonment_threshold": "high",
            "prior_product_familiarity": "medium",
        },
    },

    # --------------------------- Partner Central --------------------------
    # B2B personas — property owners and managers using the Partner Central
    # console. Levers are interpreted in a B2B frame: `trust_baseline` is
    # trust in the platform as a distribution channel, `time_pressure` is
    # task urgency per listing, `budget_sensitivity` is fee/margin
    # sensitivity, etc. All three are agent-drafted pending UXR input.
    {
        "id": "individual_property_owner",
        "name": "Individual Property Owner (FRBO)",
        "lob": "partner_central",
        "brand": "Partner Central",
        "is_primary": True,
        "scope": "brand",
        "confidence": "low",
        "summary": "For-Rent-by-Owner. Manages up to ~10 properties directly on Vrbo. Hobbyist/side-income lens; most UI-dependent audience.",
        "research_notes": "Individual owners managing their own properties directly on Vrbo · usually up to ~10 properties. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "medium",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "low",
            "cognitive_load_sensitivity": "high",
            "error_propensity": "medium",
            "device_context": "mixed",
            "budget_sensitivity": "high",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "medium",
        },
    },
    {
        "id": "platform_property_manager",
        "name": "Platform Property Manager (PPM)",
        "lob": "partner_central",
        "brand": "Partner Central",
        "is_primary": False,
        "scope": "brand",
        "confidence": "low",
        "summary": "Manages multiple properties directly via the Vrbo/Expedia console (sometimes with unofficial 3rd-party tooling). High-volume, speed-oriented.",
        "research_notes": "Property managers who manage multiple properties directly through the Vrbo/Expedia platform (or via unofficial 3rd-party software). Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "high",
            "info_processing_style": "skimmer",
            "risk_tolerance": "medium",
            "cognitive_load_sensitivity": "medium",
            "error_propensity": "medium",
            "device_context": "desktop",
            "budget_sensitivity": "medium-high",
            "abandonment_threshold": "medium",
            "prior_product_familiarity": "high",
        },
    },
    {
        "id": "integrated_property_manager",
        "name": "Integrated Property Manager (IPM)",
        "lob": "partner_central",
        "brand": "Partner Central",
        "is_primary": False,
        "scope": "brand",
        "confidence": "low",
        "summary": "Uses third-party connectivity software (PMS) to manage listings via API. Partner Central is a secondary/fallback surface.",
        "research_notes": "Property managers using third-party connectivity software (PMS) to manage listings via API. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "medium",
            "time_pressure": "medium",
            "info_processing_style": "skimmer",
            "risk_tolerance": "medium-high",
            "cognitive_load_sensitivity": "low",
            "error_propensity": "low",
            "device_context": "desktop",
            "budget_sensitivity": "high",
            "abandonment_threshold": "medium-high",
            "prior_product_familiarity": "high",
        },
    },

    # ---------------------- Cross-brand (X-Brand) --------------------------
    # These have lob="" and scope="cross_brand". get_segments_for_lob returns
    # them in addition to brand segments for any active LOB filter.
    {
        "id": "gen_z_traveler",
        "name": "Gen Z Traveler",
        "lob": "",
        "brand": "Cross-brand",
        "is_primary": False,
        "scope": "cross_brand",
        "confidence": "low",
        "summary": "Intent- and vibe-driven, budget-constrained. Mobile-first, content-native.",
        "research_notes": "Strong qualitative signal · limited prioritization evidence. Lever mapping is agent-drafted.",
        "levers": {
            "trust_baseline": "low-medium",
            "time_pressure": "medium",
            "info_processing_style": "skimmer",
            "risk_tolerance": "medium-high",
            "cognitive_load_sensitivity": "medium-high",
            "error_propensity": "medium",
            "device_context": "mobile",
            "budget_sensitivity": "high",
            "abandonment_threshold": "high",
            "prior_product_familiarity": "low-medium",
        },
    },
    {
        "id": "high_value_traveler",
        "name": "High Value Traveler",
        "lob": "",
        "brand": "Cross-brand",
        "is_primary": False,
        "scope": "cross_brand",
        "confidence": "high",
        "summary": "~20% of travelers driving ~50% of GBV. Overlaps heavily with each brand's headpin segment.",
        "research_notes": "Strong analytics backing · overlaps with each brand's 'headpin' segment. Lever profile inherits the cautious, sophisticated premium traveler pattern.",
        "levers": {
            "trust_baseline": "high",
            "time_pressure": "low-medium",
            "info_processing_style": "deep_reader",
            "risk_tolerance": "medium-high",
            "cognitive_load_sensitivity": "low-medium",
            "error_propensity": "low",
            "device_context": "mixed",
            "budget_sensitivity": "low",
            "abandonment_threshold": "low-medium",
            "prior_product_familiarity": "high",
        },
    },
]


def get_segment_preset(segment_id: str) -> dict | None:
    """Return a copy of the preset or None if the id is unknown."""
    for preset in SEGMENT_PRESETS:
        if preset["id"] == segment_id:
            return {
                **preset,
                "levers": dict(preset["levers"]),
            }
    return None


def list_lobs() -> list[dict]:
    """Return a copy of the LOB catalog."""
    return [dict(lob) for lob in LOBS]


def get_lob(lob_id: str) -> dict | None:
    """Return a copy of the LOB definition or None if the id is unknown."""
    for lob in LOBS:
        if lob["id"] == lob_id:
            return dict(lob)
    return None


# Cross-brand segments are traveler-side by definition, so they only surface
# under consumer-facing LOBs. B2B LOBs (e.g., Partner Central) stay empty
# until they get their own research-backed segments.
_CONSUMER_LOB_IDS: set[str] = {"expedia", "vrbo", "hotels_com"}


def get_segments_for_lob(lob_id: str) -> list[dict]:
    """Return segments visible under the given LOB filter.

    This is:
      - every brand segment whose ``lob`` matches ``lob_id``
      - every ``scope == 'cross_brand'`` segment, but only when ``lob_id`` is
        a consumer-facing LOB. B2B LOBs don't inherit traveler segments.

    The returned list is a deep-enough copy that callers can mutate it without
    leaking back into the canonical catalog.
    """
    include_cross_brand = lob_id in _CONSUMER_LOB_IDS
    return [
        {**preset, "levers": dict(preset["levers"])}
        for preset in SEGMENT_PRESETS
        if preset.get("lob") == lob_id
        or (include_cross_brand and preset.get("scope") == "cross_brand")
    ]


def normalize_persona(persona: dict) -> dict:
    """Ensure a persona dict carries the legacy 4-float behavior model.

    If the persona already has explicit ``exploration / patience / attention /
    error_rate``, we keep them — that lets users tweak past whatever the lever
    derivation suggests. Otherwise we derive from ``levers`` (or from a segment
    preset, if a segment id is supplied).
    """
    out = dict(persona)
    levers = dict(out.get("levers") or {})

    # Pull defaults from the segment if the persona names one but lacks levers.
    segment_id = out.get("segment")
    if segment_id and not levers:
        preset = get_segment_preset(segment_id)
        if preset is not None:
            levers = dict(preset["levers"])

    if levers:
        out["levers"] = levers
        derived = derive_behavior_floats(levers)
        for field in ("exploration", "patience", "attention", "error_rate"):
            if field not in out or out[field] is None:
                out[field] = derived[field]

    return out
