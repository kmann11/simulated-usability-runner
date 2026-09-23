"""Warm up a Playwright storage_state file against a real site.

Use this when the runner gets blocked as "not human" on sites with aggressive
bot detection (DataDome, Akamai Bot Manager, Cloudflare). Most notable case:
expedia.com.

Usage:
    python3 scripts/warm_up_session.py https://www.expedia.com/ output/expedia_session.json

What it does
------------
1. Launches a headful Chromium with the same realistic fingerprint + stealth
   patches the runner uses.
2. Navigates to the URL.
3. Waits for you to solve any "I'm not a robot" challenge, log in, browse
   around, etc. — the bot-check service marks your cookies / session tokens as
   legit.
4. On Enter, saves the session's cookies + localStorage to a JSON file.

Then, in your experiment config:

    {
      "browser": {
        "storage_state_path": "output/expedia_session.json"
      }
    }

Every future runner session will start with those already-verified cookies,
and the site will treat you as a returning human visitor instead of a fresh
bot.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

# Same inline stealth patches as the runner — keeps fingerprints consistent
# between warm-up and runs. If this diverges from generic_usability_runner.py
# the site may issue a different challenge to the runner than it issued here.
STEALTH_INIT_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); } catch (e) {}
try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 }); } catch (e) {}
const originalPermissionsQuery = window.navigator.permissions && window.navigator.permissions.query;
if (originalPermissionsQuery) {
  window.navigator.permissions.query = (parameters) =>
    parameters && parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalPermissionsQuery(parameters);
}
if (!window.chrome) {
  window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {} };
}
try {
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.apply(this, arguments);
  };
} catch (e) {}
"""

DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)


async def warm_up(url: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Persistent on-disk Chrome profile keyed to the output session file. Using a
    # real profile (instead of an ephemeral context) is what gets us past
    # aggressive bot defenses like HUMAN/PerimeterX on expedia.com — the browser
    # then looks identical to a regular returning Chrome user.
    profile_dir = out_path.with_suffix(out_path.suffix + ".profile")
    profile_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
            user_agent=DEFAULT_UA,
            viewport={"width": 1440, "height": 900},
            locale="en-US",
            timezone_id="America/Los_Angeles",
            color_scheme="light",
        )
        await context.add_init_script(STEALTH_INIT_SCRIPT)
        page = context.pages[0] if context.pages else await context.new_page()

        print(f"[warm-up] Opening {url} in a real Chrome window...")
        print(f"[warm-up] Using persistent profile at {profile_dir}")
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        except Exception as err:
            print(f"[warm-up] Navigation warning: {err}")

        print()
        print("=" * 70)
        print("  Do the following in the browser window that just opened:")
        print()
        print("    1. Solve any 'I'm not a robot' / captcha challenge.")
        print("    2. Optional: log in, accept cookies, search for something,")
        print("       scroll around naturally — anything that makes the session")
        print("       look like a real visitor.")
        print()
        print("  When you're done, come back to THIS terminal and press Enter.")
        print("=" * 70)
        print()

        await asyncio.get_event_loop().run_in_executor(None, input, "Press Enter to save session and exit... ")

        await context.storage_state(path=str(out_path))
        await context.close()

        print(f"\n[warm-up] Saved session to {out_path}")
        print()
        print("Use it in your experiment config:")
        print()
        print('  "browser": {')
        print(f'    "storage_state_path": "{out_path}"')
        print("  }")
        print()


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/warm_up_session.py <URL> <OUTPUT_JSON>", file=sys.stderr)
        print("Example:", file=sys.stderr)
        print("  python3 scripts/warm_up_session.py https://www.expedia.com/ output/expedia_session.json", file=sys.stderr)
        return 2

    url = sys.argv[1]
    out_path = Path(sys.argv[2])

    if not url.startswith(("http://", "https://")):
        print(f"[warm-up] URL must start with http:// or https:// (got: {url})", file=sys.stderr)
        return 2

    asyncio.run(warm_up(url, out_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
