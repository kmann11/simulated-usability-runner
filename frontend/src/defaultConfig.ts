import type { ExperimentConfig } from "./types";
import { SEGMENT_PRESETS, deriveBehaviorFloats } from "./segments";

function personaFromSegment(segmentId: string) {
  const preset = SEGMENT_PRESETS.find((p) => p.id === segmentId);
  if (!preset) {
    throw new Error(`Unknown segment id ${segmentId}`);
  }
  const floats = deriveBehaviorFloats(preset.levers);
  return {
    name: preset.name,
    segment: preset.id,
    levers: { ...preset.levers },
    ...floats,
  };
}

export const DEFAULT_CONFIG: ExperimentConfig = {
  experiment_name: "generic_checkout_study",
  start_url: "https://example.com",
  lob: "expedia",
  tasks: [
    "Search for a hotel stay for 2 adults for next weekend.",
    "Compare a few options and open one that looks like a good fit.",
    "Review the room details, total price, and cancellation policy.",
    "Continue to the checkout or final booking step.",
  ],
  success_criteria: {
    url_contains: ["/checkout", "/payment"],
    text_contains: ["Checkout", "Payment", "Order Summary"],
  },
  max_steps: 25,
  click_timeout_ms: 5000,
  runs_per_persona: 2,
  output_file: "output/generic_usability_results.csv",
  model: "gpt-4o",
  run_timeout_s: 120,
  sleep_scale: 0.6,
  hydrate_timeout_ms: 45000,
  observation_char_limit: 2500,
  candidate_limits: {
    click: 12,
    input: 8,
    select: 4,
  },
  test_data: {
    full_name: "Jordan Lee",
    first_name: "Jordan",
    last_name: "Lee",
    email: "jordan.lee@example.com",
    phone: "555-010-2458",
    address1: "123 Research Ave",
    address2: "Suite 400",
    city: "Austin",
    state: "Texas",
    postal_code: "78701",
    notes: "Usability test participant",
  },
  task_search_hint: "target product name",
  site_hints: {
    prefer_labels: ["search", "add to cart", "checkout"],
    avoid_labels: ["delete", "remove", "sign out", "cancel order"],
  },
  // Every non-custom segment visible under the default Expedia LOB:
  // 4 brand segments (Quality Seeker primary, Family, Couple, Latinx) plus
  // 2 cross-brand ones (Gen Z, High Value). Users can remove any they don't
  // want. Keep this order in sync with ConfigForm.handleLobChange.
  personas: [
    personaFromSegment("quality_seeker"),
    personaFromSegment("family_traveler"),
    personaFromSegment("couple_traveler"),
    personaFromSegment("latinx_traveler"),
    personaFromSegment("gen_z_traveler"),
    personaFromSegment("high_value_traveler"),
  ],
};
