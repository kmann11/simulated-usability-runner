import { guessPrototypeSource, PROTOTYPE_SOURCE_LABEL } from "./prototypeSource";

export function isValidPrototypeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Short human label for a pasted link (for previews and loading UI). */
export function formatLinkLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (host.endsWith("figma.com") && segments.length >= 3) {
      const slug = decodeURIComponent(segments[2])
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (slug) return slug;
    }

    if (segments.length > 0) {
      const path = decodeURIComponent(segments[segments.length - 1])
        .replace(/[-_]+/g, " ")
        .trim();
      if (path && path.length < 48) return `${path} (${host})`;
    }

    return host;
  } catch {
    return trimmed.slice(0, 60);
  }
}

export function buildRunPlanCopy(startUrl: string, taskCount: number, travelerCount: number): string {
  if (!isValidPrototypeUrl(startUrl)) {
    return "Paste a working link above. We need a page we can open in a browser.";
  }

  const label = formatLinkLabel(startUrl);
  const source = guessPrototypeSource(startUrl);
  const sourceNote = source ? ` (${PROTOTYPE_SOURCE_LABEL[source]})` : "";
  const steps =
    taskCount === 0
      ? "Add at least one step below so we know what to try."
      : taskCount === 1
        ? "We'll try your 1 step"
        : `We'll try your ${taskCount} steps`;
  const who =
    travelerCount === 1
      ? "as your selected traveler type."
      : `as each of your ${travelerCount} traveler types.`;

  return `We'll open “${label}”${sourceNote}. ${steps} ${who}`;
}
