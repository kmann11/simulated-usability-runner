from __future__ import annotations

import argparse
import asyncio
import copy
import csv
import datetime as dt
import json
import os
import random
import re
import sys
import threading
from pathlib import Path
from typing import Any, Callable

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - runtime dependency
    OpenAI = None


DEFAULT_GENERIC_CONFIG = {
    "experiment_name": "generic_usability_study",
    "start_url": "https://example.com",
    "tasks": [
        "Complete the target workflow on the website.",
    ],
    "success_criteria": {
        "url_contains": [],
        "text_contains": [],
    },
    "max_steps": 25,
    "click_timeout_ms": 5000,
    "runs_per_persona": 4,
    "random_seed": None,
    "output_file": "output/generic_usability_results.csv",
    "model": os.getenv("USABILITY_MODEL", "gpt-4o"),
    # Friendly defaults for real consumer sites (Expedia, Vrbo, etc.):
    # - run_timeout_s 240 gives the AI 4 minutes to walk + decide per session
    # - hydrate_timeout_ms 15000 stops waiting for "fully idle" sooner, since
    #   real OTA pages never go idle (analytics, lazy-loaded rails, etc.)
    "run_timeout_s": 240,
    "sleep_scale": 0.6,
    "hydrate_timeout_ms": 15000,
    "browser": {
        # Flip to True if running headless (CI / no display).
        # Headful is much harder for bot-detection to flag.
        # USABILITY_HEADLESS=true (Docker/Render) defaults this to True.
        "headless": os.getenv("USABILITY_HEADLESS", "").strip().lower()
        in {"1", "true", "yes", "on"},
        # Real Chrome on macOS. Keep the Chrome major version current-ish.
        "user_agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/130.0.0.0 Safari/537.36"
        ),
        "viewport": {"width": 1440, "height": 900},
        "locale": "en-US",
        "timezone_id": "America/Los_Angeles",
        "color_scheme": "light",
        # Apply inline stealth patches (navigator.webdriver, plugins,
        # languages, webgl vendor, permissions query). Zero deps.
        "use_stealth": True,
        # Optional path to a pre-warmed Playwright storage_state JSON.
        # Produced by scripts/warm_up_session.py. This is what unlocks
        # aggressive sites like expedia.com — you complete the real
        # browser bot-check once, save the state, then the runner
        # reuses those cookies / tokens for every session.
        "storage_state_path": None,
        # When True, before the headless persona loop runs the script opens
        # a single headed browser at start_url, waits for the operator to
        # press Enter in the terminal (after completing SSO / login), and
        # saves the resulting cookies + localStorage to storage_state_path.
        # Every persona run then inherits the authenticated session via the
        # normal storage_state plumbing. Requires storage_state_path to be
        # set and a TTY — silently skipped in non-interactive contexts
        # (e.g. when invoked from the FastAPI server) so the API doesn't
        # hang on input().
        "interactive_auth": False,
    },
    "observation_char_limit": 2500,
    "candidate_limits": {
        "click": 12,
        "input": 8,
        "select": 4,
    },
    "test_data": {
        "full_name": "Jordan Lee",
        "first_name": "Jordan",
        "last_name": "Lee",
        "email": "jordan.lee@example.com",
        "phone": "555-010-2458",
        "address1": "123 Research Ave",
        "address2": "Suite 400",
        "city": "Austin",
        "state": "Texas",
        "postal_code": "78701",
        "notes": "Usability test participant",
    },
    "task_search_hint": "",
    "site_hints": {
        "prefer_labels": [],
        "avoid_labels": [
            "delete",
            "remove",
            "sign out",
            "log out",
            "cancel order",
            "clear cart",
        ],
    },
    "personas": [
        {
            "name": "busy_commuter",
            "exploration": 0.2,
            "patience": 0.4,
            "attention": 0.3,
            "error_rate": 0.4,
        },
        {
            "name": "budget_student",
            "exploration": 0.5,
            "patience": 0.8,
            "attention": 0.7,
            "error_rate": 0.2,
        },
        {
            "name": "first_time_user",
            "exploration": 0.4,
            "patience": 0.6,
            "attention": 0.5,
            "error_rate": 0.6,
        },
    ],
}

STOPWORDS = {
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "from",
    "in",
    "into",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "your",
    "you",
    "their",
    "then",
    "that",
    "this",
    "website",
    "page",
    "item",
    "target",
    "workflow",
    "complete",
    "proceed",
}

CLICK_ACTIONS = {"click", "type", "select"}

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CLIENT = OpenAI(api_key=OPENAI_API_KEY) if OpenAI and OPENAI_API_KEY else None
ProgressCallback = Callable[[dict[str, Any]], None]
CancelCallback = Callable[[], bool]


def cancel_requested(callback: CancelCallback | None) -> bool:
    return bool(callback and callback())


def recursive_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            recursive_merge(base[key], value)
        else:
            base[key] = value
    return base


def load_config(config_path: str | None) -> dict[str, Any]:
    config = copy.deepcopy(DEFAULT_GENERIC_CONFIG)
    if not config_path:
        return config

    with open(config_path) as handle:
        override = json.load(handle)

    return recursive_merge(config, override)


def scaled_sleep(config: dict[str, Any], lower: float, upper: float) -> float:
    return max(0.05, random.uniform(lower, upper) * float(config["sleep_scale"]))


def vary_behavior(persona: dict[str, Any]) -> dict[str, float]:
    return {
        "exploration": max(0, min(1, persona["exploration"] + random.uniform(-0.15, 0.15))),
        "patience": max(0, min(1, persona["patience"] + random.uniform(-0.15, 0.15))),
        "attention": max(0, min(1, persona["attention"] + random.uniform(-0.15, 0.15))),
        "error_rate": max(0, min(1, persona["error_rate"] + random.uniform(-0.15, 0.15))),
    }


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def task_keywords(config: dict[str, Any]) -> list[str]:
    tokens: list[str] = []
    seen = set()
    for task in config["tasks"]:
        for token in re.findall(r"[a-zA-Z0-9]+", task.lower()):
            if len(token) < 4 or token in STOPWORDS or token in seen:
                continue
            seen.add(token)
            tokens.append(token)
    return tokens


def infer_fill_value(field_label: str, config: dict[str, Any]) -> str | None:
    label = field_label.lower()
    data = config["test_data"]
    search_hint = config.get("task_search_hint", "").strip()
    keyword_hint = " ".join(task_keywords(config)[:4]).strip()

    if any(token in label for token in ("search", "find", "query", "keyword")):
        return search_hint or keyword_hint or config["tasks"][0]
    if "email" in label:
        return data["email"]
    if "phone" in label or "mobile" in label or "tel" in label:
        return data["phone"]
    if "full name" in label or (("name" in label) and ("first" not in label and "last" not in label)):
        return data["full_name"]
    if "first name" in label or label == "first":
        return data["first_name"]
    if "last name" in label or "surname" in label:
        return data["last_name"]
    if "address 2" in label or "apt" in label or "suite" in label:
        return data["address2"]
    if "address" in label or "street" in label:
        return data["address1"]
    if "city" in label:
        return data["city"]
    if "state" in label or "province" in label or "region" in label:
        return data["state"]
    if "zip" in label or "postal" in label:
        return data["postal_code"]
    if "note" in label or "comment" in label or "message" in label or "instructions" in label:
        return data["notes"]
    return None


def choose_select_option(field: dict[str, Any], config: dict[str, Any]) -> str | None:
    label = field["label"].lower()
    options = field["options"]
    data = config["test_data"]

    preferred = None
    if "state" in label or "province" in label or "region" in label:
        preferred = data["state"]
    elif "country" in label:
        preferred = "United States"

    if preferred:
        for option in options:
            if preferred.lower() in option.lower():
                return option

    for option in options:
        lower_option = option.lower()
        if lower_option in ("", "select", "choose", "please select"):
            continue
        return option

    return None


def success_reached(observation: dict[str, Any], config: dict[str, Any]) -> bool:
    criteria = config.get("success_criteria", {})
    url_tokens = [token.lower() for token in criteria.get("url_contains", []) if token.strip()]
    text_tokens = [token.lower() for token in criteria.get("text_contains", []) if token.strip()]
    combined = " ".join(
        [
            observation["title"],
            observation["main_text"],
            observation["dialog_text"],
        ]
    ).lower()

    if url_tokens or text_tokens:
        return any(token in observation["url"].lower() for token in url_tokens) or any(
            token in combined for token in text_tokens
        )

    fallback_tokens = ("thank you", "confirmation", "order complete", "payment", "checkout")
    return any(token in combined for token in fallback_tokens)


def observation_signature(observation: dict[str, Any]) -> tuple[Any, ...]:
    return (
        observation["url"],
        observation["title"],
        observation["dialog_text"][:200],
        tuple(candidate["label"] for candidate in observation["click_candidates"][:5]),
        tuple(field["label"] for field in observation["input_candidates"][:4]),
        observation["success_reached"],
    )


def parse_action(action: str) -> tuple[str, list[str]]:
    if action in ("scroll_down", "scroll_up", "wait", "back", "done"):
        return action, []

    match = re.match(r"^(click|type|select)\[(.*)\]$", action)
    if not match:
        return "unknown", []

    kind = match.group(1)
    payload = match.group(2)
    if kind == "click":
        return kind, [payload]
    if " => " not in payload:
        return "unknown", []
    left, right = payload.split(" => ", 1)
    return kind, [left, right]


def build_available_actions(observation: dict[str, Any], config: dict[str, Any]) -> list[str]:
    actions: list[str] = []

    for candidate in observation["click_candidates"][: config["candidate_limits"]["click"]]:
        actions.append(f"click[{candidate['label']}]")

    for field in observation["input_candidates"][: config["candidate_limits"]["input"]]:
        value = infer_fill_value(field["label"], config)
        if not value:
            continue
        current_value = field.get("current_value", "").strip()
        if current_value and current_value == value:
            continue
        actions.append(f"type[{field['label']} => {value}]")

    for field in observation["select_candidates"][: config["candidate_limits"]["select"]]:
        option = choose_select_option(field, config)
        if option:
            actions.append(f"select[{field['label']} => {option}]")

    actions.extend(["scroll_down", "scroll_up", "wait", "back", "done"])
    deduped: list[str] = []
    seen = set()
    for action in actions:
        if action in seen:
            continue
        seen.add(action)
        deduped.append(action)
    return deduped


def score_action(
    action: str,
    observation: dict[str, Any],
    config: dict[str, Any],
    recent_actions: list[str],
) -> float:
    kind, args = parse_action(action)
    keywords = task_keywords(config)
    prefer_labels = [label.lower() for label in config["site_hints"].get("prefer_labels", [])]
    avoid_labels = [label.lower() for label in config["site_hints"].get("avoid_labels", [])]
    lower_action = action.lower()

    if action == "done":
        return 100.0 if observation["success_reached"] else -50.0
    if action == "wait":
        return -1.5
    if action == "scroll_up":
        return -1.0
    if action == "scroll_down":
        return 0.5
    if action == "back":
        return -3.0

    if len(recent_actions) >= 2 and recent_actions[-1] == recent_actions[-2] == action:
        return -8.0

    score = 0.0
    for keyword in keywords:
        if keyword in lower_action:
            score += 2.0
    for label in prefer_labels:
        if label and label in lower_action:
            score += 2.5
    for label in avoid_labels:
        if label and label in lower_action:
            score -= 6.0

    if kind == "click":
        label = args[0].lower()
        if any(token in label for token in ("next", "continue", "checkout", "submit", "search", "view", "details")):
            score += 1.5
        if label in ("menu", "home"):
            score -= 0.5
    elif kind == "type":
        label = args[0].lower()
        if any(token in label for token in ("search", "email", "name", "address", "phone")):
            score += 2.0
    elif kind == "select":
        score += 1.5

    return score


def choose_fallback_action(
    observation: dict[str, Any],
    behavior: dict[str, float],
    history: list[str],
    config: dict[str, Any],
) -> str:
    available = observation["available_actions"]
    recent_actions = history[-2:]

    if observation["success_reached"]:
        return "done"

    if random.random() > behavior["patience"] and len(history) > 14:
        return "done"

    if random.random() < 0.04 + (1 - behavior["attention"]) * 0.1:
        return "wait"

    scored = sorted(
        ((score_action(action, observation, config, recent_actions), action) for action in available),
        key=lambda item: item[0],
        reverse=True,
    )

    if random.random() < behavior["error_rate"] * 0.08 and len(scored) > 2:
        return scored[min(2, len(scored) - 1)][1]

    if random.random() < behavior["exploration"] * 0.12 and "scroll_down" in available:
        return "scroll_down"

    return scored[0][1]


def format_tasks(tasks: list[str]) -> str:
    return "\n".join(f"{index}. {task}" for index, task in enumerate(tasks, start=1))


def ai_decide(
    observation: dict[str, Any],
    behavior: dict[str, float],
    history: list[str],
    config: dict[str, Any],
) -> str:
    if CLIENT is None:
        return choose_fallback_action(observation, behavior, history, config)

    prompt = f"""
You are a simulated usability participant navigating a real website.

Behavior parameters:
- exploration={behavior['exploration']:.2f}
- patience={behavior['patience']:.2f}
- attention={behavior['attention']:.2f}
- error_rate={behavior['error_rate']:.2f}

Tasks:
{format_tasks(config['tasks'])}

Recent history:
{history[-5:] if history else "[]"}

Current URL:
{observation['url']}

Page title:
{observation['title']}

Visible headings:
{observation['headings']}

Main page text excerpt:
{observation['main_text']}

Dialog excerpt:
{observation['dialog_text'] or "None"}

Visible inputs:
{observation['input_candidates']}

Visible selects:
{observation['select_candidates']}

Available actions:
{observation['available_actions']}

Choose exactly one available action. Avoid repeating the same non-productive action.
Respond with only the action string.
""".strip()

    try:
        response = CLIENT.chat.completions.create(
            model=config["model"],
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
        )
        action = response.choices[0].message.content.strip()
        if action in observation["available_actions"]:
            return action
    except Exception:
        pass

    return choose_fallback_action(observation, behavior, history, config)


async def dismiss_overlays(page) -> None:
    common_labels = [
        "Accept",
        "Allow",
        "Close",
        "Dismiss",
        "Got it",
        "Continue",
        "Not now",
        "OK",
    ]
    for label in common_labels:
        try:
            await page.get_by_text(label, exact=False).first.click(timeout=250)
            await asyncio.sleep(0.1)
        except Exception:
            continue


async def wait_for_page_ready(page, config: dict[str, Any]) -> None:
    deadline = asyncio.get_running_loop().time() + (int(config["hydrate_timeout_ms"]) / 1000)
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=min(5000, int(config["hydrate_timeout_ms"])))
    except Exception:
        pass

    await page.wait_for_timeout(1000)

    while asyncio.get_running_loop().time() < deadline:
        await dismiss_overlays(page)
        try:
            snapshot = await page.evaluate(
                """
                () => {
                  const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
                  return {
                    readyState: document.readyState,
                    textLength: text.length,
                    htmlLength: (document.documentElement?.outerHTML || '').length,
                    bodyChildCount: document.body?.children?.length || 0,
                    clickableCount: document.querySelectorAll('button, a, [role="button"], input, textarea, select').length,
                  };
                }
                """
            )
        except Exception:
            snapshot = {
                "readyState": "loading",
                "textLength": 0,
                "htmlLength": 0,
                "bodyChildCount": 0,
                "clickableCount": 0,
            }

        if snapshot["readyState"] != "loading" and (
            snapshot["textLength"] > 80
            or snapshot["htmlLength"] > 250
            or snapshot["bodyChildCount"] > 0
            or snapshot["clickableCount"] > 0
        ):
            return

        await page.wait_for_timeout(750)

    raise PlaywrightTimeoutError("Page did not become interactive in time")


async def capture_observation(page, config: dict[str, Any]) -> dict[str, Any]:
    await dismiss_overlays(page)

    raw = await page.evaluate(
        """
        (limits) => {
          const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim();
          const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 1 && rect.height > 1;
          };
          const inferLabel = (el) => {
            const aria = clean(el.getAttribute('aria-label'));
            if (aria) return aria;
            const placeholder = clean(el.getAttribute('placeholder'));
            if (placeholder) return placeholder;
            const id = el.getAttribute('id');
            if (id) {
              const explicit = document.querySelector(`label[for="${id}"]`);
              const labelText = clean(explicit?.innerText || explicit?.textContent || '');
              if (labelText) return labelText;
            }
            const wrapped = el.closest('label');
            const wrappedText = clean(wrapped?.innerText || wrapped?.textContent || '');
            if (wrappedText) return wrappedText;
            return clean(el.getAttribute('name')) || clean(el.getAttribute('title'));
          };

          const bodyText = clean(document.body?.innerText || '');
          const title = clean(document.title || '');
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
            .filter(isVisible)
            .map((el) => clean(el.innerText || el.textContent || ''))
            .filter(Boolean)
            .slice(0, 8);
          const dialog = Array.from(document.querySelectorAll('[role="dialog"], dialog'))
            .find(isVisible);
          const dialogText = clean(dialog?.innerText || dialog?.textContent || '');

          const clickCandidates = [];
          const seenClicks = new Set();
          for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="link"], input[type="submit"], input[type="button"], summary')) {
            if (!isVisible(el)) continue;
            const label = clean(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || el.getAttribute('title'));
            if (!label) continue;
            const key = label.toLowerCase();
            if (seenClicks.has(key)) continue;
            seenClicks.add(key);
            clickCandidates.push({
              label,
              role: el.getAttribute('role') || el.tagName.toLowerCase(),
            });
            if (clickCandidates.length >= limits.click) break;
          }

          const inputCandidates = [];
          const seenInputs = new Set();
          for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]')) {
            if (!isVisible(el)) continue;
            const label = inferLabel(el);
            if (!label) continue;
            const key = label.toLowerCase();
            if (seenInputs.has(key)) continue;
            seenInputs.add(key);
            const value = 'value' in el ? clean(el.value || '') : clean(el.innerText || el.textContent || '');
            inputCandidates.push({
              label,
              type: clean(el.getAttribute('type')) || el.tagName.toLowerCase(),
              placeholder: clean(el.getAttribute('placeholder')),
              current_value: value.slice(0, 60),
              value_present: Boolean(value),
            });
            if (inputCandidates.length >= limits.input) break;
          }

          const selectCandidates = [];
          const seenSelects = new Set();
          for (const el of document.querySelectorAll('select')) {
            if (!isVisible(el)) continue;
            const label = inferLabel(el);
            if (!label) continue;
            const key = label.toLowerCase();
            if (seenSelects.has(key)) continue;
            seenSelects.add(key);
            const options = Array.from(el.options)
              .map((option) => clean(option.textContent || option.value || ''))
              .filter(Boolean)
              .slice(0, 10);
            selectCandidates.push({
              label,
              options,
              current_value: clean(el.value || ''),
            });
            if (selectCandidates.length >= limits.select) break;
          }

          return {
            url: window.location.href,
            title,
            headings,
            bodyText,
            dialogText,
            clickCandidates,
            inputCandidates,
            selectCandidates,
          };
        }
        """,
        config["candidate_limits"],
    )

    observation = {
        "url": raw["url"],
        "title": raw["title"],
        "headings": raw["headings"],
        "main_text": raw["bodyText"][: int(config["observation_char_limit"])],
        "dialog_text": raw["dialogText"][:600],
        "click_candidates": raw["clickCandidates"],
        "input_candidates": raw["inputCandidates"],
        "select_candidates": raw["selectCandidates"],
    }
    observation["success_reached"] = success_reached(observation, config)
    observation["available_actions"] = build_available_actions(observation, config)
    return observation


async def click_by_label(page, label: str, timeout_ms: int) -> bool:
    pattern = re.compile(re.escape(label), re.IGNORECASE)
    strategies = [
        lambda: page.get_by_role("button", name=pattern).first.click(timeout=timeout_ms),
        lambda: page.get_by_role("link", name=pattern).first.click(timeout=timeout_ms),
        lambda: page.get_by_text(pattern).first.click(timeout=timeout_ms),
    ]
    for strategy in strategies:
        try:
            await strategy()
            return True
        except Exception:
            continue
    return False


async def fill_field(page, field_label: str, value: str, timeout_ms: int) -> bool:
    label_pattern = re.compile(re.escape(field_label), re.IGNORECASE)
    try:
        await page.get_by_label(label_pattern).first.fill(value, timeout=timeout_ms)
        return True
    except Exception:
        pass

    try:
        await page.get_by_placeholder(label_pattern).first.fill(value, timeout=timeout_ms)
        return True
    except Exception:
        pass

    return await page.evaluate(
        """
        ({ fieldLabel, value }) => {
          const clean = (text) => (text || '').replace(/\\s+/g, ' ').trim();
          const inferLabel = (el) => {
            const aria = clean(el.getAttribute('aria-label'));
            if (aria) return aria;
            const placeholder = clean(el.getAttribute('placeholder'));
            if (placeholder) return placeholder;
            const id = el.getAttribute('id');
            if (id) {
              const explicit = document.querySelector(`label[for="${id}"]`);
              const labelText = clean(explicit?.innerText || explicit?.textContent || '');
              if (labelText) return labelText;
            }
            const wrapped = el.closest('label');
            const wrappedText = clean(wrapped?.innerText || wrapped?.textContent || '');
            if (wrappedText) return wrappedText;
            return clean(el.getAttribute('name')) || clean(el.getAttribute('title'));
          };

          for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]')) {
            if (inferLabel(el).toLowerCase() !== fieldLabel.toLowerCase()) continue;
            el.focus();
            if ('value' in el) {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              el.innerText = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
          }
          return false;
        }
        """,
        {"fieldLabel": field_label, "value": value},
    )


async def choose_option(page, field_label: str, option_label: str, timeout_ms: int) -> bool:
    label_pattern = re.compile(re.escape(field_label), re.IGNORECASE)
    try:
        await page.get_by_label(label_pattern).first.select_option(label=option_label, timeout=timeout_ms)
        return True
    except Exception:
        pass

    return await page.evaluate(
        """
        ({ fieldLabel, optionLabel }) => {
          const clean = (text) => (text || '').replace(/\\s+/g, ' ').trim();
          const inferLabel = (el) => {
            const aria = clean(el.getAttribute('aria-label'));
            if (aria) return aria;
            const id = el.getAttribute('id');
            if (id) {
              const explicit = document.querySelector(`label[for="${id}"]`);
              const labelText = clean(explicit?.innerText || explicit?.textContent || '');
              if (labelText) return labelText;
            }
            const wrapped = el.closest('label');
            return clean(wrapped?.innerText || wrapped?.textContent || '') || clean(el.getAttribute('name'));
          };

          for (const el of document.querySelectorAll('select')) {
            if (inferLabel(el).toLowerCase() !== fieldLabel.toLowerCase()) continue;
            const option = Array.from(el.options).find((item) => clean(item.textContent || item.value) === optionLabel);
            if (!option) return false;
            el.value = option.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }
        """,
        {"fieldLabel": field_label, "optionLabel": option_label},
    )


async def perform_action(page, action: str, config: dict[str, Any]) -> bool:
    timeout_ms = int(config["click_timeout_ms"])
    kind, args = parse_action(action)
    await dismiss_overlays(page)

    if kind == "scroll_down":
        await page.mouse.wheel(0, random.randint(500, 1100))
        await asyncio.sleep(scaled_sleep(config, 0.3, 0.8))
        return True
    if kind == "scroll_up":
        await page.mouse.wheel(0, -random.randint(300, 800))
        await asyncio.sleep(scaled_sleep(config, 0.3, 0.8))
        return True
    if kind == "wait":
        await asyncio.sleep(scaled_sleep(config, 0.7, 1.5))
        return True
    if kind == "back":
        try:
            await page.go_back(timeout=timeout_ms, wait_until="domcontentloaded")
            await asyncio.sleep(scaled_sleep(config, 0.5, 1.0))
            return True
        except Exception:
            return False
    if kind == "click":
        return await click_by_label(page, args[0], timeout_ms)
    if kind == "type":
        return await fill_field(page, args[0], args[1], timeout_ms)
    if kind == "select":
        return await choose_option(page, args[0], args[1], timeout_ms)

    return False


async def run_user(
    page,
    persona: dict[str, Any],
    config: dict[str, Any],
    artifact_dir: Path | None = None,
    should_cancel: CancelCallback | None = None,
) -> dict[str, Any]:
    behavior = vary_behavior(persona)
    nav_path: list[str] = []
    semantic_path: list[str] = []
    state_history: list[tuple[Any, ...]] = []
    hesitation = 0
    misclick = 0
    backtrack = 0
    abandoned = False
    cancelled = False
    capture_screenshots = bool(config.get("capture_screenshots", False))
    artifacts: list[dict[str, Any]] = []

    page.set_default_timeout(int(config["click_timeout_ms"]))
    await page.goto(config["start_url"], timeout=30000, wait_until="domcontentloaded")
    await wait_for_page_ready(page, config)

    initial_observation = await capture_observation(page, config)
    state_history.append(observation_signature(initial_observation))
    visited_urls = [initial_observation["url"]]

    for _ in range(int(config["max_steps"])):
        if cancel_requested(should_cancel):
            cancelled = True
            abandoned = True
            break

        observation = await capture_observation(page, config)
        if observation["success_reached"]:
            break

        pre_signature = observation_signature(observation)
        action = ai_decide(observation, behavior, nav_path, config)
        step_index = len(nav_path)
        nav_path.append(action)
        semantic_path.append(action)

        if action == "done":
            abandoned = not observation["success_reached"]
            artifact = await _build_step_artifact(
                page=page,
                step_index=step_index,
                persona=persona,
                observation=observation,
                action=action,
                status="abandoned" if abandoned else "completed",
                notes=[],
                artifact_dir=artifact_dir if capture_screenshots else None,
            )
            artifacts.append(artifact)
            break

        if cancel_requested(should_cancel):
            cancelled = True
            abandoned = True
            break

        action_failed = not await perform_action(page, action, config)
        step_notes: list[str] = []
        if action == "wait":
            hesitation += 1
            step_notes.append("hesitation_wait")
        elif action_failed:
            misclick += 1
            step_notes.append("step_error")
            step_notes.append("misclick")

        post_observation = await capture_observation(page, config)
        post_signature = observation_signature(post_observation)
        visited_urls.append(post_observation["url"])

        if action == "back" or (
            len(visited_urls) >= 3 and visited_urls[-1] == visited_urls[-3] and visited_urls[-1] != visited_urls[-2]
        ):
            backtrack += 1
            step_notes.append("navigated_back")
        elif post_signature in state_history[:-1] and post_signature != pre_signature:
            backtrack += 1
            step_notes.append("loop_to_prior_state")
        elif action.startswith("click[") and not action_failed and post_signature == pre_signature:
            misclick += 1
            step_notes.append("misclick")
            step_notes.append("no_visible_change_after_click")

        state_history.append(post_signature)

        artifact = await _build_step_artifact(
            page=page,
            step_index=step_index,
            persona=persona,
            observation=post_observation,
            action=action,
            status="error" if action_failed else "completed",
            notes=step_notes,
            artifact_dir=artifact_dir if capture_screenshots else None,
        )
        artifacts.append(artifact)

        if cancel_requested(should_cancel):
            cancelled = True
            abandoned = True
            break

        if post_observation["success_reached"]:
            abandoned = False
            break
    else:
        abandoned = True

    final_observation = await capture_observation(page, config)
    if final_observation["success_reached"]:
        abandoned = False

    # Stamp the run-level outcome onto the final artifact so consumers can tell
    # whether this session as a whole completed, was abandoned, or errored.
    if artifacts:
        final_status = (
            "abandoned"
            if abandoned
            else ("error" if any(a["status"] == "error" for a in artifacts) else "completed")
        )
        artifacts[-1] = {**artifacts[-1], "session_status": final_status}

    return {
        "experiment_name": config["experiment_name"],
        "start_url": config["start_url"],
        "persona": persona["name"],
        "steps": len(nav_path),
        "hesitation": hesitation,
        "misclick": misclick,
        "backtrack": backtrack,
        "abandoned": abandoned,
        "nav_path": " -> ".join(nav_path),
        "semantic_path": " -> ".join(semantic_path),
        "timestamp": dt.datetime.now().isoformat(),
        "artifacts": artifacts,
        "cancelled": cancelled,
    }


async def _build_step_artifact(
    page,
    step_index: int,
    persona: dict[str, Any],
    observation: dict[str, Any],
    action: str,
    status: str,
    notes: list[str],
    artifact_dir: Path | None,
) -> dict[str, Any]:
    """Bundle the data the heuristic review layer needs from one step.

    Screenshot capture is best-effort — if it fails (page closed, navigation
    in flight, etc.) we just skip it. The runner shouldn't crash because
    Playwright couldn't take a picture.
    """
    visible_labels: list[str] = []
    for candidate in observation.get("click_candidates", []) or []:
        label = (candidate.get("label") or "").strip()
        if label:
            visible_labels.append(label)
    for candidate in observation.get("select_candidates", []) or []:
        label = (candidate.get("label") or "").strip()
        if label:
            visible_labels.append(label)

    headings = observation.get("headings", []) or []
    title = observation.get("title", "") or ""
    summary_chunks: list[str] = []
    if title:
        summary_chunks.append(title)
    if headings:
        summary_chunks.append(" / ".join(headings[:3]))
    body_excerpt = (observation.get("main_text") or "")[:240]
    if body_excerpt:
        summary_chunks.append(body_excerpt)
    dom_summary = " — ".join(chunk for chunk in summary_chunks if chunk)

    screenshot_path: str | None = None
    if artifact_dir is not None:
        screenshot_path = await _capture_screenshot(page, artifact_dir, persona["name"], step_index)

    return {
        "step_index": step_index,
        "persona": persona["name"],
        "url": observation.get("url", ""),
        "action": action,
        "status": status,
        "screenshot_path": screenshot_path,
        "dom_summary": dom_summary,
        "visible_labels": visible_labels[:24],
        "notes": notes,
    }


async def _capture_screenshot(
    page,
    artifact_dir: Path,
    persona_name: str,
    step_index: int,
) -> str | None:
    safe_persona = re.sub(r"[^A-Za-z0-9_\-]+", "_", persona_name) or "persona"
    persona_dir = artifact_dir / safe_persona
    persona_dir.mkdir(parents=True, exist_ok=True)
    target = persona_dir / f"step_{step_index:02d}.png"
    try:
        await page.screenshot(path=str(target), full_page=False, timeout=5000)
    except Exception:  # pragma: no cover - best-effort capture
        return None
    try:
        return str(target.relative_to(WORKSPACE_ROOT))
    except ValueError:
        return str(target)


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent


async def main(config_path: str | None) -> None:
    config = load_config(config_path)
    if config.get("random_seed") is not None:
        random.seed(int(config["random_seed"]))

    results = await run_experiment(config)
    output_file = str(config.get("output_file") or "").strip()
    if output_file:
        print(f"Wrote results to {output_file}", flush=True)
    else:
        print(f"Completed {len(results)} runs (no CSV written: output_file is empty).", flush=True)


STEALTH_INIT_SCRIPT = """
// ---- Inline stealth patches (no external deps) ----
// Hide the "I'm automated" giveaways that trip up DataDome / Akamai / Cloudflare.
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// Non-empty plugins list
Object.defineProperty(navigator, 'plugins', {
  get: () => [1, 2, 3, 4, 5],
});

// Normal language setup
Object.defineProperty(navigator, 'languages', {
  get: () => ['en-US', 'en'],
});

// Hardware concurrency + deviceMemory to realistic values
try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); } catch (e) {}
try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 }); } catch (e) {}

// Permissions.query: stop returning 'prompt' for Notification perm, which real Chrome
// never does for a session that has a granted/denied permission policy.
const originalPermissionsQuery = window.navigator.permissions && window.navigator.permissions.query;
if (originalPermissionsQuery) {
  window.navigator.permissions.query = (parameters) =>
    parameters && parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalPermissionsQuery(parameters);
}

// Chrome runtime stub (headless Chromium doesn't expose window.chrome)
if (!window.chrome) {
  window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {} };
}

// WebGL vendor/renderer unmask — headless Chromium returns "Google Inc." which is a tell
try {
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.apply(this, arguments);
  };
} catch (e) {}
"""


async def _wait_for_auth_handoff(
    resume_event: threading.Event | None,
    progress_callback: Callable[..., None] | None = None,
) -> None:
    """Pause until the operator confirms login (UI button or terminal Enter)."""
    if resume_event is not None:
        if progress_callback:
            progress_callback(
                phase="waiting_for_login",
                message=(
                    "A browser window opened for you to sign in. "
                    "When the page you want to test is on screen, click “I'm signed in” in the app."
                ),
            )
        while not resume_event.is_set():
            await asyncio.sleep(0.3)
        return

    if not sys.stdin.isatty():
        print(
            "[auth] interactive_auth enabled but no TTY or UI resume signal — skipping. "
            "Enable sign-in from the web app or run from a terminal.",
            flush=True,
        )
        return

    await asyncio.get_event_loop().run_in_executor(
        None, input, "Press Enter to save session and start the run... "
    )


async def _interactive_auth_warmup(
    start_url: str,
    storage_state_path: str,
    user_agent: str | None = None,
    viewport: dict[str, int] | None = None,
    locale: str | None = None,
    timezone_id: str | None = None,
    resume_event: threading.Event | None = None,
    progress_callback: Callable[..., None] | None = None,
) -> None:
    """Headed browser pause for SSO / manual login before the headless run.

    Opens the start_url in a real Chrome window, waits for the operator to
    finish logging in (terminal Enter or API/UI resume signal), then snapshots
    cookies + localStorage to storage_state_path. The main run picks the
    state up via the existing storage_state_path config field, so every
    persona / run inherits the authenticated session.
    """
    out = Path(storage_state_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    headless_env = os.getenv("USABILITY_HEADLESS", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    no_display = sys.platform.startswith("linux") and not os.getenv("DISPLAY", "").strip()
    if headless_env or no_display:
        warn = (
            "[auth] interactive_auth requested but this host is headless / has no display — "
            "skipping sign-in warmup. Use a public link, a pre-warmed storage_state, "
            "or run the API locally with a display."
        )
        print(warn, flush=True)
        if progress_callback:
            progress_callback(
                phase="starting",
                message=(
                    "Skipping interactive sign-in (headless/cloud backend). "
                    "Continuing with whatever session state is already on disk, if any."
                ),
            )
        return

    if resume_event is None and not sys.stdin.isatty():
        print(
            "[auth] interactive_auth enabled but no TTY attached — skipping. "
            "Run the script from a terminal to use it.",
            flush=True,
        )
        return

    if progress_callback:
        progress_callback(
            phase="waiting_for_login",
            message="Opening a browser window so you can sign in…",
        )

    print(
        f"[auth] Opening {start_url} in a headed browser for manual login...",
        flush=True,
    )

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=False,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )
        ctx_kwargs: dict[str, Any] = {}
        if user_agent:
            ctx_kwargs["user_agent"] = user_agent
        if viewport:
            ctx_kwargs["viewport"] = viewport
        if locale:
            ctx_kwargs["locale"] = locale
        if timezone_id:
            ctx_kwargs["timezone_id"] = timezone_id
        # Seed with prior state if any, so re-runs don't start from zero.
        if out.exists():
            ctx_kwargs["storage_state"] = str(out)
        context = await browser.new_context(**ctx_kwargs)
        page = await context.new_page()
        try:
            await page.goto(start_url, wait_until="domcontentloaded", timeout=60000)
        except Exception as err:
            print(f"[auth] Initial navigation warning: {err}", flush=True)

        if resume_event is None:
            print("", flush=True)
            print("=" * 70, flush=True)
            print("  Complete login / SSO in the browser window that just opened.", flush=True)
            print("  When you're back at the prototype URL and signed in,", flush=True)
            print("  return to THIS terminal and press Enter to hand off to the", flush=True)
            print("  headless agent.", flush=True)
            print("=" * 70, flush=True)
            print("", flush=True)

        await _wait_for_auth_handoff(resume_event, progress_callback)

        await context.storage_state(path=str(out))
        await context.close()
        await browser.close()

        print(f"[auth] Saved authenticated session to {out}", flush=True)


async def run_experiment(
    config: dict[str, Any],
    progress_callback: ProgressCallback | None = None,
    should_cancel: CancelCallback | None = None,
    auth_resume_event: threading.Event | None = None,
) -> list[dict[str, Any]]:
    fieldnames = [
        "experiment_name",
        "start_url",
        "persona",
        "steps",
        "hesitation",
        "misclick",
        "backtrack",
        "abandoned",
        "nav_path",
        "semantic_path",
        "timestamp",
    ]

    # The CSV file is now opt-in. CLI / notebook callers pass a real
    # output_file path and get the on-disk artifact they expect; the API
    # passes "" so no auto-save happens (the UI builds the CSV on demand).
    output_file_value = str(config.get("output_file") or "").strip()
    output_file: Path | None = None
    if output_file_value:
        output_file = Path(output_file_value)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with output_file.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()

    rows_in_memory: list[dict[str, Any]] = []

    capture_screenshots = bool(config.get("capture_screenshots", False))
    run_dir: Path | None = None
    total_sessions = max(1, len(config["personas"]) * int(config["runs_per_persona"]))

    def emit_progress(**event: Any) -> None:
        if progress_callback is None:
            return
        progress_callback(
            {
                "total_sessions": total_sessions,
                **event,
            }
        )

    emit_progress(
        phase="starting",
        completed_sessions=0,
        message="Starting the browser and getting the run ready.",
    )

    if capture_screenshots:
        run_stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = re.sub(r"[^A-Za-z0-9_\-]+", "_", config["experiment_name"]) or "run"
        run_dir = WORKSPACE_ROOT / "output" / "runs" / f"{run_stamp}_{safe_name}"
        run_dir.mkdir(parents=True, exist_ok=True)

    sessions: list[tuple[str, list[dict[str, Any]]]] = []

    browser_conf = config.get("browser", {}) or {}

    # Optional: pause for human SSO/login before the headless agent takes
    # over. Does its work in a separate Playwright instance so it can fully
    # tear down before the main run starts.
    interactive_auth = bool(browser_conf.get("interactive_auth", False))
    storage_state_path_for_auth = browser_conf.get("storage_state_path")
    if interactive_auth and storage_state_path_for_auth:
        await _interactive_auth_warmup(
            start_url=config["start_url"],
            storage_state_path=str(storage_state_path_for_auth),
            user_agent=browser_conf.get("user_agent"),
            viewport=browser_conf.get("viewport"),
            locale=browser_conf.get("locale"),
            timezone_id=browser_conf.get("timezone_id"),
            resume_event=auth_resume_event,
            progress_callback=progress_callback,
        )
    elif interactive_auth and not storage_state_path_for_auth:
        print(
            "[auth] interactive_auth is True but browser.storage_state_path "
            "is empty — skipping. Set storage_state_path so the saved "
            "cookies have somewhere to live.",
            flush=True,
        )

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=bool(browser_conf.get("headless", False)),
        )
        context_kwargs: dict[str, Any] = {}
        if browser_conf.get("user_agent"):
            context_kwargs["user_agent"] = browser_conf["user_agent"]
        if browser_conf.get("viewport"):
            context_kwargs["viewport"] = browser_conf["viewport"]
        if browser_conf.get("locale"):
            context_kwargs["locale"] = browser_conf["locale"]
        if browser_conf.get("timezone_id"):
            context_kwargs["timezone_id"] = browser_conf["timezone_id"]
        if browser_conf.get("color_scheme"):
            context_kwargs["color_scheme"] = browser_conf["color_scheme"]
        storage_state_path = browser_conf.get("storage_state_path")
        if storage_state_path and Path(storage_state_path).exists():
            context_kwargs["storage_state"] = str(storage_state_path)
            print(f"[browser] Using pre-warmed session from {storage_state_path}", flush=True)
        context = await browser.new_context(**context_kwargs)
        if browser_conf.get("use_stealth", True):
            await context.add_init_script(STEALTH_INIT_SCRIPT)
        emit_progress(
            phase="browser_ready",
            completed_sessions=0,
            message="Browser ready. Starting the walkthroughs.",
        )
        session_counter = 0
        stop_after_current = False
        for persona in config["personas"]:
            if cancel_requested(should_cancel):
                stop_after_current = True
                emit_progress(
                    phase="cancelling",
                    completed_sessions=len(sessions),
                    message="Stopping the run after the current work finishes.",
                )
                break
            for run_number in range(int(config["runs_per_persona"])):
                if cancel_requested(should_cancel):
                    stop_after_current = True
                    emit_progress(
                        phase="cancelling",
                        completed_sessions=len(sessions),
                        message="Stopping the run after the current work finishes.",
                    )
                    break
                session_counter += 1
                page = await context.new_page()
                emit_progress(
                    phase="session_started",
                    completed_sessions=session_counter - 1,
                    current_session=session_counter,
                    current_persona=persona["name"],
                    current_run_number=run_number + 1,
                    message=(
                        f"Running {persona['name']} "
                        f"({session_counter} of {total_sessions})."
                    ),
                )
                print(
                    f"Running {persona['name']} run {run_number + 1}/{config['runs_per_persona']}",
                    flush=True,
                )
                artifact_dir = None
                if run_dir is not None:
                    artifact_dir = run_dir / f"run_{run_number + 1:02d}"
                    artifact_dir.mkdir(parents=True, exist_ok=True)

                try:
                    result = await asyncio.wait_for(
                        run_user(
                            page,
                            persona,
                            config,
                            artifact_dir=artifact_dir,
                            should_cancel=should_cancel,
                        ),
                        timeout=int(config["run_timeout_s"]),
                    )
                except asyncio.TimeoutError:
                    result = {
                        "experiment_name": config["experiment_name"],
                        "start_url": config["start_url"],
                        "persona": persona["name"],
                        "steps": 0,
                        "hesitation": 0,
                        "misclick": 0,
                        "backtrack": 0,
                        "abandoned": True,
                        "nav_path": "error:Timeout",
                        "semantic_path": "error",
                        "timestamp": dt.datetime.now().isoformat(),
                        "artifacts": [],
                        "cancelled": False,
                    }
                except (PlaywrightError, PlaywrightTimeoutError) as exc:
                    result = {
                        "experiment_name": config["experiment_name"],
                        "start_url": config["start_url"],
                        "persona": persona["name"],
                        "steps": 0,
                        "hesitation": 0,
                        "misclick": 0,
                        "backtrack": 0,
                        "abandoned": True,
                        "nav_path": f"error:{type(exc).__name__}",
                        "semantic_path": "error",
                        "timestamp": dt.datetime.now().isoformat(),
                        "artifacts": [],
                        "cancelled": False,
                    }

                # Capture the row without the artifacts payload (which lives
                # in JSON only) and optionally persist to disk.
                csv_row = {key: result[key] for key in fieldnames}
                rows_in_memory.append(csv_row)
                if output_file is not None:
                    with output_file.open("a", newline="") as handle:
                        writer = csv.DictWriter(handle, fieldnames=fieldnames)
                        writer.writerow(csv_row)

                sessions.append((persona["name"], result.get("artifacts", []) or []))
                emit_progress(
                    phase="session_completed",
                    completed_sessions=session_counter,
                    current_session=session_counter,
                    current_persona=persona["name"],
                    current_run_number=run_number + 1,
                    message=(
                        f"Completed {persona['name']} "
                        f"({session_counter} of {total_sessions})."
                    ),
                )

                print(
                    f"Completed {persona['name']} run {run_number + 1}/{config['runs_per_persona']}: "
                    f"abandoned={result['abandoned']} steps={result['steps']}",
                    flush=True,
                )
                await page.close()
                await asyncio.sleep(scaled_sleep(config, 0.5, 1.0))
                if result.get("cancelled") or cancel_requested(should_cancel):
                    stop_after_current = True
                    emit_progress(
                        phase="cancelling",
                        completed_sessions=len(sessions),
                        current_session=session_counter,
                        current_persona=persona["name"],
                        current_run_number=run_number + 1,
                        message="Stopping the run and packaging what has completed so far.",
                    )
                    break
            if stop_after_current:
                break
        await browser.close()

    emit_progress(
        phase="finishing" if not cancel_requested(should_cancel) else "cancelling",
        completed_sessions=len(sessions),
        current_session=len(sessions),
        message=(
            "Compiling the results."
            if not cancel_requested(should_cancel)
            else "Stopping the run and compiling the completed sessions."
        ),
    )

    if output_file is not None:
        with output_file.open() as handle:
            rows = list(csv.DictReader(handle))
    else:
        # No CSV was written — every value is already a string-friendly
        # primitive in csv_row; normalize booleans the way csv.DictReader
        # would so downstream consumers (e.g. summarize_rows) keep working.
        rows = [
            {key: ("True" if value is True else "False" if value is False else str(value)) for key, value in row.items()}
            for row in rows_in_memory
        ]

    # Tack the per-session artifact bundles onto the returned rows. The CSV
    # schema is unchanged; consumers that don't care can ignore the extra key.
    for row, (_, artifacts) in zip(rows, sessions):
        row["_artifacts"] = artifacts

    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generic AI usability runner for arbitrary websites.")
    parser.add_argument("--config", help="Path to a JSON config file.")
    args = parser.parse_args()
    asyncio.run(main(args.config))
