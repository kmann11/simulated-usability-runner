import type { LeverDefinition, Lob, SegmentPreset } from "./types";

// Mirrors scripts/persona_segments.py. Kept as a *fallback* for first paint
// and offline — the canonical source of truth is now the backend, consumed via
// the catalog context (frontend/src/catalog.tsx). If the backend is reachable,
// this file's data gets replaced in-memory.

export const LOBS_FALLBACK: Lob[] = [
  {
    id: "expedia",
    name: "Expedia",
    summary: "Multi-product OTA — packages, flights, hotels, cars, activities.",
  },
  {
    id: "hotels_com",
    name: "Hotels.com",
    summary: "Hotel-focused, deal-and-rewards lens.",
  },
  {
    id: "vrbo",
    name: "Vrbo",
    summary: "Whole-home vacation rentals; group / family travel.",
  },
  {
    id: "b2b_network",
    name: "B2B Network",
    summary: "Partner-facing distribution and tooling.",
  },
  {
    id: "partner_central",
    name: "Partner Central",
    summary: "Property-side console for hotel / VR partners.",
  },
];

const LEVEL_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "low-medium", label: "Low-Medium" },
  { value: "medium", label: "Medium" },
  { value: "medium-high", label: "Medium-High" },
  { value: "high", label: "High" },
];

// UI-only grouping that organizes the 10 levers into 4 small categories so the
// editor doesn't read as a flat wall of dropdowns.
export const LEVER_GROUPS: { id: string; name: string; lever_ids: string[] }[] = [
  {
    id: "mindset",
    name: "Mindset",
    lever_ids: [
      "info_processing_style",
      "cognitive_load_sensitivity",
      "prior_familiarity",
    ],
  },
  {
    id: "pressure",
    name: "Pressure",
    lever_ids: [
      "time_pressure",
      "budget_sensitivity",
      "abandonment_threshold",
    ],
  },
  {
    id: "risk_trust",
    name: "Risk & trust",
    lever_ids: [
      "trust_baseline",
      "risk_tolerance",
      "error_propensity",
    ],
  },
  {
    id: "context",
    name: "Context",
    lever_ids: ["device_context"],
  },
];

export const LEVER_DEFINITIONS: LeverDefinition[] = [
  {
    id: "trust_baseline",
    name: "Trust baseline",
    summary: "How much the tester trusts the platform out of the gate.",
    options: LEVEL_OPTIONS,
  },
  {
    id: "time_pressure",
    name: "Time pressure",
    summary: "How much hurry they're in. High = books in days, not weeks.",
    options: LEVEL_OPTIONS,
  },
  {
    id: "info_processing_style",
    name: "Info processing style",
    summary: "Skimmer vs deep reader.",
    options: [
      { value: "skimmer", label: "Skimmer" },
      { value: "deep_reader", label: "Deep reader" },
    ],
  },
  {
    id: "risk_tolerance",
    name: "Risk tolerance",
    summary: "How willing to try unfamiliar or unverified options.",
    options: LEVEL_OPTIONS,
  },
  {
    id: "cognitive_load_sensitivity",
    name: "Cognitive load sensitivity",
    summary: "How easily overwhelmed by complex flows or copy.",
    options: LEVEL_OPTIONS,
  },
  {
    id: "error_propensity",
    name: "Error propensity",
    summary: "How likely to slip up, misclick, or skip steps.",
    options: LEVEL_OPTIONS,
  },
  {
    id: "device_context",
    name: "Device / context",
    summary: "Where they're using the site from.",
    options: [
      { value: "desktop", label: "Desktop" },
      { value: "mobile", label: "Mobile" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    id: "budget_sensitivity",
    name: "Budget sensitivity",
    summary: "How price-conscious. High = chases deals; Low = pays for premium.",
    options: LEVEL_OPTIONS,
  },
  {
    id: "abandonment_threshold",
    name: "Abandonment threshold",
    summary:
      "How quickly they bail when frustrated. Low = patient; High = bounces fast.",
    options: LEVEL_OPTIONS,
  },
  {
    id: "prior_familiarity",
    name: "Prior product familiarity",
    summary: "How familiar they are with this kind of product.",
    options: LEVEL_OPTIONS,
  },
];

// Mirrors scripts/persona_segments.py's SEGMENT_PRESETS. Kept as a fallback
// for first paint / offline. The backend is canonical; if it's reachable, the
// catalog context replaces this in memory.
export const SEGMENT_PRESETS: SegmentPreset[] = [
  // ----------------------- Brand Expedia (BEX) -------------------------
  {
    id: "quality_seeker",
    name: "Quality Seeker",
    lob: "expedia",
    brand: "Expedia",
    is_primary: true,
    scope: "brand",
    confidence: "high",
    summary: "Trusted-advisor expectations, deep planner, pays for premium.",
    research_notes:
      "Books ~60 days out · ~6.9 trips/yr · loyalty member · ~$6,100/yr spend.",
    levers: {
      trust_baseline: "high",
      time_pressure: "low",
      info_processing_style: "deep_reader",
      risk_tolerance: "medium-high",
      cognitive_load_sensitivity: "low-medium",
      error_propensity: "low",
      device_context: "desktop",
      budget_sensitivity: "low",
      abandonment_threshold: "low",
      prior_familiarity: "high",
    },
  },
  {
    id: "family_traveler",
    name: "Family Traveler",
    lob: "expedia",
    brand: "Expedia",
    is_primary: false,
    scope: "brand",
    confidence: "high",
    summary:
      "1+ child plus 1+ adult. Plans deeply, anxious about getting it right, hunts deals.",
    research_notes:
      "Well-defined across Marketing, UXR, and Analytics · plans 3-6 months ahead · budget-conscious.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "low",
      info_processing_style: "deep_reader",
      risk_tolerance: "low",
      cognitive_load_sensitivity: "high",
      error_propensity: "medium",
      device_context: "desktop",
      budget_sensitivity: "high",
      abandonment_threshold: "medium",
      prior_familiarity: "medium",
    },
  },
  {
    id: "couple_traveler",
    name: "Couple Traveler",
    lob: "expedia",
    brand: "Expedia",
    is_primary: false,
    scope: "brand",
    confidence: "medium",
    summary:
      "Two adults, no children. Flexible, more spontaneous than family travelers.",
    research_notes:
      "Defined behaviorally · stronger in analytics than qualitative depth. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium-high",
      time_pressure: "medium",
      info_processing_style: "skimmer",
      risk_tolerance: "medium-high",
      cognitive_load_sensitivity: "medium",
      error_propensity: "low-medium",
      device_context: "mixed",
      budget_sensitivity: "medium",
      abandonment_threshold: "medium",
      prior_familiarity: "medium-high",
    },
  },
  {
    id: "latinx_traveler",
    name: "Latinx Traveler",
    lob: "expedia",
    brand: "Expedia",
    is_primary: false,
    scope: "brand",
    confidence: "low",
    summary:
      "US Latino Quality Seekers. Similar headpin profile to QS with distinct cultural and media patterns.",
    research_notes:
      "Marketing-defined · significant gaps in UXR and Analytics alignment. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium-high",
      time_pressure: "low-medium",
      info_processing_style: "deep_reader",
      risk_tolerance: "medium",
      cognitive_load_sensitivity: "medium",
      error_propensity: "low",
      device_context: "mixed",
      budget_sensitivity: "medium",
      abandonment_threshold: "medium",
      prior_familiarity: "medium",
    },
  },

  // ------------------------------- Vrbo --------------------------------
  {
    id: "group_planner",
    name: "Group Planner",
    lob: "vrbo",
    brand: "Vrbo",
    is_primary: true,
    scope: "brand",
    confidence: "medium",
    summary:
      "Umbrella Vrbo planner. Coordinates for a group, reads deeply, sensitive to fees and policies.",
    research_notes:
      "Strongest clarity on group size and stay length · fuzziest on who in the group is the planner. Umbrella lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "low-medium",
      info_processing_style: "deep_reader",
      risk_tolerance: "low-medium",
      cognitive_load_sensitivity: "medium",
      error_propensity: "medium",
      device_context: "desktop",
      budget_sensitivity: "medium",
      abandonment_threshold: "medium",
      prior_familiarity: "medium",
    },
  },
  {
    id: "complex_family_planner",
    name: "Complex Family Planner",
    lob: "vrbo",
    brand: "Vrbo",
    is_primary: false,
    scope: "brand",
    confidence: "high",
    summary:
      "Multi-household family trips (kids + grandparents). Deep researcher, sensitive to fees and policies.",
    research_notes:
      "Strong qualitative definition · analytics definition exists but is still evolving. Plans 2-3+ months ahead.",
    levers: {
      trust_baseline: "low-medium",
      time_pressure: "low-medium",
      info_processing_style: "deep_reader",
      risk_tolerance: "low",
      cognitive_load_sensitivity: "medium",
      error_propensity: "medium",
      device_context: "desktop",
      budget_sensitivity: "medium",
      abandonment_threshold: "medium",
      prior_familiarity: "medium",
    },
  },
  {
    id: "large_group_planner",
    name: "Large Group Planner",
    lob: "vrbo",
    brand: "Vrbo",
    is_primary: false,
    scope: "brand",
    confidence: "medium",
    summary:
      "4-5+ adults, friend-group trips. Coordinates schedules and bed counts across many decision-makers.",
    research_notes:
      "Planner role clear qualitatively · harder to isolate 'planner' in data. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "medium",
      info_processing_style: "deep_reader",
      risk_tolerance: "medium",
      cognitive_load_sensitivity: "medium",
      error_propensity: "medium",
      device_context: "desktop",
      budget_sensitivity: "medium-high",
      abandonment_threshold: "medium",
      prior_familiarity: "medium",
    },
  },
  {
    id: "long_stay_traveler",
    name: "Long-Stay Traveler",
    lob: "vrbo",
    brand: "Vrbo",
    is_primary: false,
    scope: "brand",
    confidence: "medium",
    summary:
      "28-30+ day stays for temp work, housing transitions, or extended leisure. High financial commitment.",
    research_notes:
      "Operationally identifiable · emerging as a segment. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "low",
      info_processing_style: "deep_reader",
      risk_tolerance: "low",
      cognitive_load_sensitivity: "medium",
      error_propensity: "low",
      device_context: "desktop",
      budget_sensitivity: "high",
      abandonment_threshold: "low",
      prior_familiarity: "medium",
    },
  },
  {
    id: "weekend_getaway",
    name: "Weekend Getaway",
    lob: "vrbo",
    brand: "Vrbo",
    is_primary: false,
    scope: "brand",
    confidence: "medium",
    summary:
      "Last-minute short stays, mobile-first. Often new to VR; price-clarity-driven.",
    research_notes:
      "Present in UXR and Analytics, less formalized as a 'planner' segment · ≤4-day booking windows · cross-shops hotels.",
    levers: {
      trust_baseline: "low",
      time_pressure: "high",
      info_processing_style: "skimmer",
      risk_tolerance: "medium",
      cognitive_load_sensitivity: "high",
      error_propensity: "medium-high",
      device_context: "mobile",
      budget_sensitivity: "high",
      abandonment_threshold: "high",
      prior_familiarity: "low",
    },
  },

  // ----------------------------- Hotels.com ----------------------------
  {
    id: "savvy_trip_taker",
    name: "Savvy Trip Taker",
    lob: "hotels_com",
    brand: "Hotels.com",
    is_primary: true,
    scope: "brand",
    confidence: "medium",
    summary: "Deal-hunter on the go, quick decisions, bounces if confused.",
    research_notes:
      "Strong in Marketing & UXR · not consistently defined in Analytics. 30% book within 3 days · ~10% lower ADR than Expedia · 9 trips/yr.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "high",
      info_processing_style: "skimmer",
      risk_tolerance: "medium",
      cognitive_load_sensitivity: "medium-high",
      error_propensity: "medium",
      device_context: "mobile",
      budget_sensitivity: "medium-high",
      abandonment_threshold: "medium-high",
      prior_familiarity: "high",
    },
  },
  {
    id: "unmanaged_business_traveler",
    name: "Unmanaged Business Traveler",
    lob: "hotels_com",
    brand: "Hotels.com",
    is_primary: false,
    scope: "brand",
    confidence: "medium",
    summary:
      "Self-booking business traveler (non-TMC). Risk-averse, time-pressured, prefers known brands.",
    research_notes:
      "Qualitatively well-defined · Analytics relies on proxies (single occupancy, no Saturday-night stay). Books <30 days · cancels ~35% less.",
    levers: {
      trust_baseline: "medium-high",
      time_pressure: "high",
      info_processing_style: "skimmer",
      risk_tolerance: "low-medium",
      cognitive_load_sensitivity: "high",
      error_propensity: "medium",
      device_context: "mixed",
      budget_sensitivity: "medium",
      abandonment_threshold: "medium",
      prior_familiarity: "high",
    },
  },
  {
    id: "last_minute_booker",
    name: "Last-minute Booker",
    lob: "hotels_com",
    brand: "Hotels.com",
    is_primary: false,
    scope: "brand",
    confidence: "low",
    summary:
      "Same-day or next-day booking. Operationally identifiable; less of a distinct persona.",
    research_notes:
      "Operationally identifiable in data · less of a distinct persona. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "low-medium",
      time_pressure: "high",
      info_processing_style: "skimmer",
      risk_tolerance: "medium",
      cognitive_load_sensitivity: "high",
      error_propensity: "medium-high",
      device_context: "mobile",
      budget_sensitivity: "medium",
      abandonment_threshold: "high",
      prior_familiarity: "medium",
    },
  },

  // --------------------------- Partner Central ------------------------
  // B2B personas using the Partner Central console. Levers are interpreted
  // in a B2B frame (trust_baseline = trust in distribution channel, etc.).
  // All three are agent-drafted pending UXR input.
  {
    id: "individual_property_owner",
    name: "Individual Property Owner (FRBO)",
    lob: "partner_central",
    brand: "Partner Central",
    is_primary: true,
    scope: "brand",
    confidence: "low",
    summary:
      "For-Rent-by-Owner. Manages up to ~10 properties directly on Vrbo. Hobbyist/side-income lens; most UI-dependent audience.",
    research_notes:
      "Individual owners managing their own properties directly on Vrbo · usually up to ~10 properties. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "medium",
      info_processing_style: "deep_reader",
      risk_tolerance: "low",
      cognitive_load_sensitivity: "high",
      error_propensity: "medium",
      device_context: "mixed",
      budget_sensitivity: "high",
      abandonment_threshold: "medium",
      prior_familiarity: "medium",
    },
  },
  {
    id: "platform_property_manager",
    name: "Platform Property Manager (PPM)",
    lob: "partner_central",
    brand: "Partner Central",
    is_primary: false,
    scope: "brand",
    confidence: "low",
    summary:
      "Manages multiple properties directly via the Vrbo/Expedia console (sometimes with unofficial 3rd-party tooling). High-volume, speed-oriented.",
    research_notes:
      "Property managers who manage multiple properties directly through the Vrbo/Expedia platform (or via unofficial 3rd-party software). Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "high",
      info_processing_style: "skimmer",
      risk_tolerance: "medium",
      cognitive_load_sensitivity: "medium",
      error_propensity: "medium",
      device_context: "desktop",
      budget_sensitivity: "medium-high",
      abandonment_threshold: "medium",
      prior_familiarity: "high",
    },
  },
  {
    id: "integrated_property_manager",
    name: "Integrated Property Manager (IPM)",
    lob: "partner_central",
    brand: "Partner Central",
    is_primary: false,
    scope: "brand",
    confidence: "low",
    summary:
      "Uses third-party connectivity software (PMS) to manage listings via API. Partner Central is a secondary/fallback surface.",
    research_notes:
      "Property managers using third-party connectivity software (PMS) to manage listings via API. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "medium",
      time_pressure: "medium",
      info_processing_style: "skimmer",
      risk_tolerance: "medium-high",
      cognitive_load_sensitivity: "low",
      error_propensity: "low",
      device_context: "desktop",
      budget_sensitivity: "high",
      abandonment_threshold: "medium-high",
      prior_familiarity: "high",
    },
  },

  // --------------------- Cross-brand (X-Brand) -------------------------
  {
    id: "gen_z_traveler",
    name: "Gen Z Traveler",
    lob: "",
    brand: "Cross-brand",
    is_primary: false,
    scope: "cross_brand",
    confidence: "low",
    summary:
      "Intent- and vibe-driven, budget-constrained. Mobile-first, content-native.",
    research_notes:
      "Strong qualitative signal · limited prioritization evidence. Lever mapping is agent-drafted.",
    levers: {
      trust_baseline: "low-medium",
      time_pressure: "medium",
      info_processing_style: "skimmer",
      risk_tolerance: "medium-high",
      cognitive_load_sensitivity: "medium-high",
      error_propensity: "medium",
      device_context: "mobile",
      budget_sensitivity: "high",
      abandonment_threshold: "high",
      prior_familiarity: "low-medium",
    },
  },
  {
    id: "high_value_traveler",
    name: "High Value Traveler",
    lob: "",
    brand: "Cross-brand",
    is_primary: false,
    scope: "cross_brand",
    confidence: "high",
    summary:
      "~20% of travelers driving ~50% of GBV. Overlaps heavily with each brand's headpin segment.",
    research_notes:
      "Strong analytics backing · overlaps with each brand's 'headpin' segment. Lever profile inherits the cautious, sophisticated premium traveler pattern.",
    levers: {
      trust_baseline: "high",
      time_pressure: "low-medium",
      info_processing_style: "deep_reader",
      risk_tolerance: "medium-high",
      cognitive_load_sensitivity: "low-medium",
      error_propensity: "low",
      device_context: "mixed",
      budget_sensitivity: "low",
      abandonment_threshold: "low-medium",
      prior_familiarity: "high",
    },
  },
];

const LEVEL_FLOAT: Record<string, number> = {
  low: 0.2,
  "low-medium": 0.35,
  medium: 0.5,
  "medium-high": 0.65,
  high: 0.8,
  skimmer: 0.2,
  deep_reader: 0.8,
};

function levelFloat(value: string | undefined, fallback = 0.5): number {
  if (!value) return fallback;
  return LEVEL_FLOAT[value] ?? fallback;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Mirrors derive_behavior_floats in scripts/persona_segments.py.
export function deriveBehaviorFloats(levers: Record<string, string>): {
  exploration: number;
  patience: number;
  attention: number;
  error_rate: number;
} {
  const info = levelFloat(levers.info_processing_style, 0.5);
  const timePressure = levelFloat(levers.time_pressure, 0.5);
  const cognitive = levelFloat(levers.cognitive_load_sensitivity, 0.5);
  const abandonment = levelFloat(levers.abandonment_threshold, 0.5);
  const err = levelFloat(levers.error_propensity, 0.5);

  const exploration = 0.5 * info + 0.25 * (1 - timePressure) + 0.25 * (1 - cognitive);
  const patience = 0.5 * (1 - abandonment) + 0.5 * (1 - timePressure);
  const attention = 0.6 * info + 0.4 * (1 - cognitive);
  const error_rate = err;

  return {
    exploration: round2(clamp(exploration)),
    patience: round2(clamp(patience)),
    attention: round2(clamp(attention)),
    error_rate: round2(clamp(error_rate)),
  };
}

// Operates on whichever catalog the caller has on hand (live context or static
// fallback) so these helpers stay useful post-catalog-refactor.
export function getSegmentPreset(
  segments: SegmentPreset[],
  segmentId: string,
): SegmentPreset | undefined {
  return segments.find((p) => p.id === segmentId);
}

// Compare a persona's current levers to its segment preset to decide whether to
// label it as "modified".
export function leversMatchSegment(
  segments: SegmentPreset[],
  segmentId: string | undefined,
  levers: Record<string, string> | undefined,
): boolean {
  if (!segmentId) return false;
  const preset = getSegmentPreset(segments, segmentId);
  if (!preset || !levers) return false;
  for (const [key, value] of Object.entries(preset.levers)) {
    if (levers[key] !== value) return false;
  }
  return true;
}

// Bucket the 0-1 floats into friendly captions for the "How they behave" line.
export function describeBehavior(floats: {
  exploration: number;
  patience: number;
  attention: number;
  error_rate: number;
}): string {
  const bucket = (v: number, low: string, mid: string, high: string) =>
    v < 0.34 ? low : v < 0.67 ? mid : high;
  return [
    `Adventurous: ${bucket(floats.exploration, "Low", "Medium", "High")}`,
    `Patient: ${bucket(floats.patience, "Low", "Medium", "High")}`,
    `Focused: ${bucket(floats.attention, "Low", "Medium", "High")}`,
    `Slip-ups: ${bucket(floats.error_rate, "Low", "Medium", "High")}`,
  ].join(" · ");
}
