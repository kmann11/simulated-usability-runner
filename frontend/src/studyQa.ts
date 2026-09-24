import type { ExperimentConfig, SegmentPreset } from "./types";
import type { RunOptionsState } from "./components/ConfigForm";

export type QaSeverity = "blocker" | "risk" | "watch" | "good";
export type QaCategory = "protocol" | "segments" | "evidence" | "synthetic_fit";

export interface QaFinding {
  severity: QaSeverity;
  category: QaCategory;
  title: string;
  detail: string;
  suggestion: string;
}

function taskLooksVague(task: string): boolean {
  const text = task.trim().toLowerCase();
  if (text.length < 28) return true;
  return /\b(explore|browse|look around|check out|review the site|use the site)\b/.test(text);
}

function taskLooksLeading(task: string): boolean {
  return /\b(best|easiest|perfect|obvious|clearly|better|cheapest|most trustworthy)\b/i.test(task);
}

function isEmotionalOrDiscoveryTask(task: string): boolean {
  return /\b(feel|emotion|delight|trust the brand|need|want|discover|motivation|preference|why)\b/i.test(
    task,
  );
}

function hasLowConfidencePersona(config: ExperimentConfig, segments: SegmentPreset[]): boolean {
  const lowConfidence = new Set(segments.filter((s) => s.confidence === "low").map((s) => s.id));
  return config.personas.some((persona) => persona.segment && lowConfidence.has(persona.segment));
}

export function buildStudyQaFindings(
  config: ExperimentConfig,
  options: RunOptionsState,
  segments: SegmentPreset[],
): QaFinding[] {
  const findings: QaFinding[] = [];
  const tasks = config.tasks.map((task) => task.trim()).filter(Boolean);
  const hasSuccessCriteria =
    config.success_criteria.url_contains.some(Boolean) ||
    config.success_criteria.text_contains.some(Boolean);

  if (!config.start_url.trim()) {
    findings.push({
      severity: "blocker",
      category: "protocol",
      title: "Missing prototype link",
      detail: "We need a link to your prototype or page before we can run the test.",
      suggestion: "Paste the link your designer shared: Figma, GitHub preview, or staging.",
    });
  }

  if (tasks.length === 0) {
    findings.push({
      severity: "blocker",
      category: "protocol",
      title: "No tasks written yet",
      detail: "Without tasks, the run becomes general browsing, which is hard to interpret.",
      suggestion: "Write one clear step with a specific outcome: what should they find or finish?",
    });
  }

  if (tasks.length > 5) {
    findings.push({
      severity: "risk",
      category: "protocol",
      title: "Too many tasks for one run",
      detail: "Long task lists make it unclear which step caused a problem and can inflate drop-off.",
      suggestion: "Split this into smaller studies, one journey stage at a time.",
    });
  }

  const vagueTasks = tasks.filter(taskLooksVague);
  if (vagueTasks.length > 0) {
    findings.push({
      severity: "risk",
      category: "protocol",
      title: "Task wording is vague",
      detail: "Broad instructions like “explore the site” produce fuzzy results that are hard to act on.",
      suggestion: `Be specific about the goal and outcome. For example, instead of “${vagueTasks[0]}”, say what to find, compare, or complete.`,
    });
  }

  const leadingTasks = tasks.filter(taskLooksLeading);
  if (leadingTasks.length > 0) {
    findings.push({
      severity: "watch",
      category: "protocol",
      title: "Task may lead the tester",
      detail: "Words like “best”, “cheapest”, or “obvious” can bias how the run is interpreted.",
      suggestion: "Use neutral wording unless price or quality judgment is what you're studying.",
    });
  }

  if (!hasSuccessCriteria) {
    findings.push({
      severity: "risk",
      category: "protocol",
      title: "No “done” signal defined",
      detail: "Without a clear finish line, completion rates are hard to interpret.",
      suggestion: "Add a word or phrase that appears on the page when the task is finished (under Advanced settings).",
    });
  }

  if (!options.capture_screenshots) {
    findings.push({
      severity: "risk",
      category: "evidence",
      title: "Screenshots are off",
      detail: "Stakeholders won't be able to see what each tester saw, only the summary numbers.",
      suggestion: "Turn screenshots on for any run you plan to share in a critique or Slack thread.",
    });
  }

  if (config.personas.length === 0) {
    findings.push({
      severity: "blocker",
      category: "segments",
      title: "No testers selected",
      detail: "Pick at least one traveler type to run the test.",
      suggestion: "Choose the main traveler type for this product area, then add others if needed.",
    });
  } else if (config.personas.length > 6) {
    findings.push({
      severity: "watch",
      category: "segments",
      title: "Lots of testers selected",
      detail: "Many traveler types at once can make the summary noisy and the run take longer.",
      suggestion: "Start with 3–5 focused types for a decision review. Add more for broader screening later.",
    });
  }

  if (hasLowConfidencePersona(config, segments)) {
    findings.push({
      severity: "watch",
      category: "segments",
      title: "Early-draft traveler type included",
      detail: "At least one traveler type has limited research backing. Treat its results as directional.",
      suggestion: "Prioritize validating those findings with real users before making big decisions.",
    });
  }

  if (tasks.some(isEmotionalOrDiscoveryTask)) {
    findings.push({
      severity: "risk",
      category: "synthetic_fit",
      title: "This run may not answer “why” questions",
      detail: "Automated walkthroughs are best for spotting friction and unclear flows, not emotions, motivations, or cultural nuance.",
      suggestion: "Use this run to sharpen your study plan, then talk to real users about feelings and preferences.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "good",
      category: "protocol",
      title: "Setup looks ready",
      detail: "Your link, tasks, testers, and screenshot settings look good for a directional run.",
      suggestion: "Click Open link & run test, then use the results to plan your next design review or user session.",
    });
  }

  return findings;
}
