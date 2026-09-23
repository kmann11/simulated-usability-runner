const PLACEHOLDER_NAMES = new Set(["", "generic_checkout_study", "Untitled study"]);

export function isPlaceholderStudyName(name: string): boolean {
  return PLACEHOLDER_NAMES.has(name.trim());
}

function prettySlug(raw: string): string {
  const text = raw.replace(/[-_]+/g, " ").trim();
  if (!text) return "";
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Suggest a human-readable study name from the link or first task. */
export function suggestStudyName(startUrl: string, tasks: string[]): string | null {
  const firstTask = tasks.map((task) => task.trim()).find(Boolean);
  if (firstTask) {
    return firstTask.length > 72 ? `${firstTask.slice(0, 69).trim()}…` : firstTask;
  }

  const trimmedUrl = startUrl.trim();
  if (!trimmedUrl) return null;

  try {
    const url = new URL(trimmedUrl);
    const host = url.hostname.replace(/^www\./, "");
    const segments = url.pathname.split("/").filter(Boolean);

    if (host.endsWith("figma.com") && segments.length >= 3) {
      const label = prettySlug(decodeURIComponent(segments[2]));
      if (label) return label;
    }

    const firstPath = segments[0] ? prettySlug(decodeURIComponent(segments[0])) : "";
    if (firstPath && firstPath.toLowerCase() !== host.split(".")[0]) {
      return `${firstPath}, ${host}`;
    }
    return host;
  } catch {
    return null;
  }
}
