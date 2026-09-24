export type PrototypeSource = "preview" | "figma" | "github" | "staging" | "live";

export const PROTOTYPE_SOURCE_LABEL: Record<PrototypeSource, string> = {
  preview: "Design preview",
  figma: "Figma prototype",
  github: "GitHub preview",
  staging: "Staging / QA",
  live: "Live site",
};

export const PROTOTYPE_HELP: Record<PrototypeSource, string> = {
  preview:
    "This looks like a design preview. Make sure the link opens in your browser before you run. Ask your designer if it does not load.",
  figma:
    "Figma usually requires sign-in. With a local backend, a Chrome window can open on this computer for one-time login. On GitHub Pages or cloud, use a public prototype link or Skip sign-in.",
  github:
    "GitHub usually requires sign-in. With a local backend, a Chrome window can open on this computer for one-time login. On GitHub Pages or cloud, use a public preview link or Skip sign-in.",
  staging:
    "This looks like a staging or QA link, good for pre-launch review. Use the same address you would send a teammate to review.",
  live:
    "This looks like a live public site. It may ask for login or block automated visits. A prototype or staging link is usually easier.",
};

/** Help text that never promises a desktop Chrome popup (Pages / cloud / API down). */
export const PROTOTYPE_HELP_NO_DESKTOP_AUTH: Partial<Record<PrototypeSource, string>> = {
  figma:
    "Figma usually requires sign-in, but desktop Chrome login is not available here. Use a public prototype link, or run the API locally for interactive sign-in.",
  github:
    "GitHub usually requires sign-in, but desktop Chrome login is not available here. Use a public preview link, or run the API locally for interactive sign-in.",
};

export const DEFAULT_PROTOTYPE_HELP =
  "Paste the link your designer shared (Figma, GitHub preview, or staging). We will recognize the type and show tips here.";

function isGitHubHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "github.com" || lower.endsWith(".github.com") || lower.endsWith(".github.io");
}

export function guessPrototypeSource(url: string): PrototypeSource | null {
  const lower = url.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("figma.com")) return "figma";
  try {
    const host = new URL(lower.startsWith("http") ? lower : `https://${lower}`).hostname;
    if (isGitHubHost(host)) return "github";
  } catch {
    if (lower.includes("github.com") || lower.includes("github.io")) return "github";
  }
  if (/localhost|127\.0\.0\.1|vercel\.app|netlify\.app|preview/.test(lower)) return "preview";
  if (/staging|qa\.|test\.|int\./.test(lower)) return "staging";
  return "live";
}

export function placeholderForPrototypeSource(source: PrototypeSource | null): string {
  if (source === "figma") return "https://www.figma.com/proto/...";
  if (source === "github") return "https://github.com/... or https://....github.io/...";
  return "Paste your prototype or staging link (https://…)";
}
