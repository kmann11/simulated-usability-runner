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
  experiment_name: "my_first_study",
  // Blank until the user pastes a real prototype link (not a fake ready URL).
  start_url: "",
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
  // Light first-run default: one try each for a couple of traveler types.
  runs_per_persona: 1,
  output_file: "output/generic_usability_results.csv",
  model: "gpt-4o",
  // Friendly defaults for real consumer sites (Expedia, Vrbo, etc.).
  // See scripts/generic_usability_runner.py DEFAULT_GENERIC_CONFIG for notes.
  run_timeout_s: 240,
  sleep_scale: 0.6,
  hydrate_timeout_ms: 15000,
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
  // Light first-run set: primary segment + one more. Users can add others.
  // Keep in sync with ConfigForm.handleLobChange slice(0, 2) behavior.
  personas: [
    personaFromSegment("quality_seeker"),
    personaFromSegment("family_traveler"),
  ],
};
