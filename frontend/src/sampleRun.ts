import type { ExperimentConfig } from "./types";
import { DEFAULT_CONFIG } from "./defaultConfig";
import { SEGMENT_PRESETS, deriveBehaviorFloats } from "./segments";

/**
 * Stable public demo for first-run CTA.
 * Playwright's TodoMVC demo is clickable (add / complete todos) and does not
 * require login. Better than example.com, which has almost nothing to click.
 */
export const SAMPLE_START_URL = "https://demo.playwright.dev/todomvc/";

export const SAMPLE_RUN_BLURB =
  "Loads a public TodoMVC demo (no login), two short tasks, and two traveler types so you can see a full walkthrough without pasting your own prototype yet.";

function personaFromSegment(segmentId: string) {
  const preset = SEGMENT_PRESETS.find((p) => p.id === segmentId);
  if (!preset) {
    throw new Error(`Unknown segment id ${segmentId}`);
  }
  return {
    name: preset.name,
    segment: preset.id,
    levers: { ...preset.levers },
    ...deriveBehaviorFloats(preset.levers),
  };
}

/** Config slice applied when the user clicks "Try a sample public page". */
export function buildSampleConfig(base: ExperimentConfig = DEFAULT_CONFIG): ExperimentConfig {
  return {
    ...base,
    experiment_name: "sample_todomvc_walkthrough",
    start_url: SAMPLE_START_URL,
    lob: "expedia",
    tasks: [
      "Add a new todo called Plan weekend trip.",
      "Mark that todo as completed.",
    ],
    success_criteria: {
      url_contains: ["todomvc"],
      text_contains: ["Clear completed", "completed"],
    },
    runs_per_persona: 1,
    run_timeout_s: 120,
    personas: [personaFromSegment("quality_seeker"), personaFromSegment("family_traveler")],
    task_search_hint: "todo",
    site_hints: {
      prefer_labels: ["add", "new todo", "completed", "clear"],
      avoid_labels: ["delete all", "sign out"],
    },
  };
}
