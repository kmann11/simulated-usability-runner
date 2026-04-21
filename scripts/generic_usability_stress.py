from __future__ import annotations

import argparse
import asyncio
import copy
import csv
import sys
import tempfile
from pathlib import Path
from statistics import mean
from typing import Any

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from scripts.generic_usability_runner import DEFAULT_GENERIC_CONFIG, run_experiment


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def build_direct_path_fixture(root: Path) -> dict[str, Any]:
    fixture_root = root / "direct_path"
    write_file(
        fixture_root / "index.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Direct Path Store</title></head>
<body>
  <header>
    <a href="index.html">Home</a>
    <a href="help.html">Help</a>
    <a href="product.html">Trail Mix Snack Pack</a>
    <a href="gift-cards.html">Gift Cards</a>
  </header>
  <main>
    <h1>Direct Path Store</h1>
    <p>Quick ordering experience for benchmark testing.</p>
    <section>
      <h2>Featured Products</h2>
      <a href="product.html">Trail Mix Snack Pack</a>
    </section>
  </main>
</body>
</html>""",
    )
    write_file(
        fixture_root / "product.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Trail Mix Snack Pack</title></head>
<body>
  <a href="index.html">Back to home</a>
  <h1>Trail Mix Snack Pack</h1>
  <p>Roasted nuts, fruit, and dark chocolate.</p>
  <a href="cart.html" role="button">Add to Cart</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "cart.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Your Cart</title></head>
<body>
  <h1>Your Cart</h1>
  <p>Trail Mix Snack Pack added.</p>
  <a href="checkout.html" role="button">Checkout</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "checkout.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Checkout</title></head>
<body>
  <h1>Checkout</h1>
  <p>Review your order and continue.</p>
  <a href="success.html" role="button">Place Order</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "success.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Order Confirmed</title></head>
<body>
  <h1>Order Confirmed</h1>
  <p>Thank you for your order.</p>
</body>
</html>""",
    )
    return {
        "experiment_name": "stress_direct_path",
        "start_url": "direct_path/index.html",
        "tasks": [
            "Find the Trail Mix Snack Pack.",
            "Add it to the cart.",
            "Proceed to checkout.",
        ],
        "success_criteria": {
            "url_contains": ["success.html"],
            "text_contains": ["Order Confirmed"],
        },
        "site_hints": {
            "prefer_labels": ["trail mix snack pack", "add to cart", "checkout", "place order"],
            "avoid_labels": DEFAULT_GENERIC_CONFIG["site_hints"]["avoid_labels"],
        },
        "task_search_hint": "Trail Mix Snack Pack",
    }


def build_search_form_fixture(root: Path) -> dict[str, Any]:
    fixture_root = root / "search_form"
    write_file(
        fixture_root / "index.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Search First Shop</title></head>
<body>
  <h1>Search First Shop</h1>
  <p>Use search to find the right product.</p>
  <label for="search-box">Search products</label>
  <input id="search-box" placeholder="Search products" />
  <button id="search-button" onclick="window.location.href='results.html'">Search</button>
  <nav>
    <a href="collections.html">Collections</a>
    <a href="about.html">About</a>
    <a href="faq.html">FAQ</a>
  </nav>
</body>
</html>""",
    )
    write_file(
        fixture_root / "results.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Search Results</title></head>
<body>
  <h1>Search Results</h1>
  <a href="mug.html">Summit Mug</a>
  <a href="poster.html">Summit Poster</a>
  <a href="stickers.html">Summit Sticker Pack</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "mug.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Summit Mug</title></head>
<body>
  <h1>Summit Mug</h1>
  <p>Ceramic mug for the early morning climb.</p>
  <a href="checkout.html" role="button">Add to Cart</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "checkout.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Checkout Form</title></head>
<body>
  <h1>Checkout Form</h1>
  <label for="full-name">Full Name</label>
  <input id="full-name" />
  <label for="email">Email</label>
  <input id="email" />
  <label for="state">State</label>
  <select id="state">
    <option value="">Select</option>
    <option>Texas</option>
    <option>Illinois</option>
    <option>California</option>
  </select>
  <a id="review-order" href="success.html" role="button" style="display:none">Review Order</a>
  <script>
    const fullName = document.getElementById('full-name');
    const email = document.getElementById('email');
    const state = document.getElementById('state');
    const review = document.getElementById('review-order');
    function updateReady() {
      const ready = fullName.value.trim() && email.value.trim() && state.value.trim();
      review.style.display = ready ? 'inline-block' : 'none';
    }
    fullName.addEventListener('input', updateReady);
    email.addEventListener('input', updateReady);
    state.addEventListener('change', updateReady);
  </script>
</body>
</html>""",
    )
    write_file(
        fixture_root / "success.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Order Confirmed</title></head>
<body>
  <h1>Order Confirmed</h1>
  <p>Thank you for your order.</p>
</body>
</html>""",
    )
    return {
        "experiment_name": "stress_search_form",
        "start_url": "search_form/index.html",
        "tasks": [
            "Search for the Summit Mug.",
            "Open the Summit Mug product page.",
            "Add it to the cart.",
            "Complete the checkout form and review the order.",
        ],
        "success_criteria": {
            "url_contains": ["success.html"],
            "text_contains": ["Order Confirmed"],
        },
        "task_search_hint": "Summit Mug",
        "site_hints": {
            "prefer_labels": ["search", "summit mug", "add to cart", "review order"],
            "avoid_labels": DEFAULT_GENERIC_CONFIG["site_hints"]["avoid_labels"],
        },
    }


def build_noisy_fixture(root: Path) -> dict[str, Any]:
    fixture_root = root / "noisy_checkout"
    write_file(
        fixture_root / "index.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Noisy Bakery</title></head>
<body>
  <header>
    <a href="index.html">Home</a>
    <a href="gifts.html">Cookie Club</a>
    <a href="cakes.html">Chocolate Cake</a>
    <a href="bakery.html">Bakery</a>
    <a href="classes.html">Baking Classes</a>
  </header>
  <main>
    <h1>Noisy Bakery</h1>
    <p>Open the bakery section to find classic cookies and pastries.</p>
    <button onclick="window.location.href='promo.html'">Flash Sale</button>
  </main>
</body>
</html>""",
    )
    write_file(
        fixture_root / "bakery.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Bakery</title></head>
<body>
  <h1>Bakery</h1>
  <a href="cookie.html">Chocolate Chip Cookie</a>
  <a href="brownie.html">Chocolate Brownie</a>
  <a href="subscription.html">Cookie Subscription</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "cookie.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Chocolate Chip Cookie</title></head>
<body>
  <h1>Chocolate Chip Cookie</h1>
  <p>Soft baked cookie with crisp edges.</p>
  <a href="basket.html" role="button">Add to Basket</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "basket.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Basket</title></head>
<body>
  <h1>Basket</h1>
  <p>Chocolate Chip Cookie added to basket.</p>
  <a href="checkout.html" role="button">Checkout</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "checkout.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Checkout</title></head>
<body>
  <h1>Checkout</h1>
  <a href="success.html" role="button">Submit Order</a>
</body>
</html>""",
    )
    write_file(
        fixture_root / "success.html",
        """<!doctype html>
<html>
<head><meta charset="utf-8"><title>Checkout Complete</title></head>
<body>
  <h1>Checkout Complete</h1>
  <p>Thank you for visiting the bakery.</p>
</body>
</html>""",
    )
    return {
        "experiment_name": "stress_noisy_checkout",
        "start_url": "noisy_checkout/index.html",
        "tasks": [
            "Open the bakery section.",
            "Find the Chocolate Chip Cookie.",
            "Add it to the basket.",
            "Proceed to checkout.",
        ],
        "success_criteria": {
            "url_contains": ["success.html"],
            "text_contains": ["Checkout Complete"],
        },
        "task_search_hint": "Chocolate Chip Cookie",
        "site_hints": {
            "prefer_labels": ["bakery", "chocolate chip cookie", "add to basket", "checkout"],
            "avoid_labels": [
                "cookie club",
                "subscription",
                "flash sale",
                *DEFAULT_GENERIC_CONFIG["site_hints"]["avoid_labels"],
            ],
        },
    }


FIXTURE_BUILDERS = [build_direct_path_fixture, build_search_form_fixture, build_noisy_fixture]


def summarize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["experiment_name"], []).append(row)

    summary_rows: list[dict[str, Any]] = []
    for fixture_name, fixture_rows in grouped.items():
        error_runs = sum(str(row["nav_path"]).startswith("error:") for row in fixture_rows)
        abandoned_runs = sum(row["abandoned"] == "True" for row in fixture_rows)
        summary_rows.append(
            {
                "experiment_name": fixture_name,
                "runs": len(fixture_rows),
                "completed_runs": len(fixture_rows) - abandoned_runs,
                "abandoned_runs": abandoned_runs,
                "error_runs": error_runs,
                "behavioral_abandonments": abandoned_runs - error_runs,
                "success_rate": round(
                    sum(row["abandoned"] != "True" for row in fixture_rows) / len(fixture_rows),
                    3,
                ),
                "avg_steps": round(mean(int(row["steps"]) for row in fixture_rows), 2),
                "avg_hesitation": round(mean(int(row["hesitation"]) for row in fixture_rows), 2),
                "avg_misclick": round(mean(int(row["misclick"]) for row in fixture_rows), 2),
                "avg_backtrack": round(mean(int(row["backtrack"]) for row in fixture_rows), 2),
            }
        )
    return summary_rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


async def run_stress_benchmark(output_prefix: str, runs_per_persona: int | None) -> tuple[Path, Path]:
    combined_rows: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix="generic-usability-fixtures-") as tmp_dir:
        root = Path(tmp_dir)
        fixture_configs = [builder(root) for builder in FIXTURE_BUILDERS]

        for fixture_config in fixture_configs:
            config = copy.deepcopy(DEFAULT_GENERIC_CONFIG)
            config.update(
                {
                    "experiment_name": fixture_config["experiment_name"],
                    "start_url": (root / fixture_config["start_url"]).resolve().as_uri(),
                    "tasks": fixture_config["tasks"],
                    "success_criteria": fixture_config["success_criteria"],
                    "task_search_hint": fixture_config["task_search_hint"],
                    "site_hints": fixture_config["site_hints"],
                    "runs_per_persona": runs_per_persona or 3,
                    "output_file": f"output/{fixture_config['experiment_name']}.csv",
                    "random_seed": 7,
                }
            )
            rows = await run_experiment(config)
            combined_rows.extend(rows)

    raw_path = Path(f"output/{output_prefix}_raw.csv")
    summary_path = Path(f"output/{output_prefix}_summary.csv")
    write_csv(raw_path, combined_rows)
    write_csv(summary_path, summarize_rows(combined_rows))
    return raw_path, summary_path


async def main(output_prefix: str, runs_per_persona: int | None) -> None:
    raw_path, summary_path = await run_stress_benchmark(output_prefix, runs_per_persona)
    print(f"Wrote raw benchmark results to {raw_path}")
    print(f"Wrote summary benchmark results to {summary_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stress benchmark for the generic usability runner.")
    parser.add_argument(
        "--output-prefix",
        default="generic_usability_benchmark",
        help="Prefix used for the raw and summary output CSV files in output/.",
    )
    parser.add_argument(
        "--runs-per-persona",
        type=int,
        help="Override benchmark runs per persona. Default is 3.",
    )
    args = parser.parse_args()
    asyncio.run(main(args.output_prefix, args.runs_per_persona))
