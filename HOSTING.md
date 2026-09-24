# Hosting the API + wiring GitHub Pages

GitHub Pages serves the **UI only**
([https://kmann11.github.io/simulated-usability-runner/](https://kmann11.github.io/simulated-usability-runner/)).
Playwright and FastAPI must run on a separate host. This repo ships a `Dockerfile`
and a Render Blueprint (`render.yaml`) for that API.

The hosted UI shows a **truth banner** and disables **Open link & run test** until
`GET /healthz` succeeds. Interactive Figma/GitHub Chrome login is never promised
from Pages or other headless hosts (`interactive_auth_available: false`).

## Status checklist

| Step | What | Done when |
| --- | --- | --- |
| 1 | Deploy API on Render (Blueprint below) | `GET https://<service>.onrender.com/healthz` returns JSON with `"status":"ok"` |
| 2 | Set GitHub Actions variable `VITE_API_BASE` | Variable equals that HTTPS origin, **no trailing slash** |
| 3 | Redeploy Pages | UI Network tab shows requests to your Render host |

**Do not invent an API URL.** If you have not deployed Render yet, leave `VITE_API_BASE` unset. The hosted UI will keep calling `/api/...` on github.io until step 2 is done.

After Render is live, from a machine with `gh` authenticated:

```bash
gh variable set VITE_API_BASE --body "https://<your-real-service>.onrender.com" -R kmann11/simulated-usability-runner
```

Then re-run **Actions → Deploy frontend to GitHub Pages**.

## 1. Deploy the API on Render (Blueprint)

1. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in.
2. **New** → **Blueprint**.
3. Connect the GitHub repo `kmann11/simulated-usability-runner` (authorize Render if needed).
4. Select branch `main`. Render reads `render.yaml`.
5. Apply the Blueprint. When prompted for env vars:
   - **`OPENAI_API_KEY`** (optional): set your OpenAI key for GPT-backed decisions. Leave blank to use the local fallback policy.
   - **`USABILITY_MODEL`** (optional): e.g. `gpt-4o`.
   - **`CORS_ORIGINS`** (optional): comma-separated **extra** browser origins (defaults already include local Vite ports and `https://kmann11.github.io`).
   - **`RUNNER_API_KEY`** (optional): if set, mutating routes require header `X-Runner-Api-Key` (or `Authorization: Bearer …`). Leave unset for the public Pages demo.
   - **`RUNNER_STRESS_ENABLED`** (optional): defaults to **off** when `USABILITY_HEADLESS=true`. Set `true` only on trusted/local hosts.
   - Rate / body knobs (optional): `RUNNER_RUNS_RATE_LIMIT`, `RUNNER_RUNS_RATE_WINDOW_S`, `RUNNER_STRESS_RATE_LIMIT`, `RUNNER_STRESS_RATE_WINDOW_S`, `RUNNER_MAX_REQUEST_BYTES`.
   - `USABILITY_HEADLESS` is already `true` in the Blueprint — leave it.
6. Wait for the first deploy. Open the service URL (HTTPS, typically `https://<name>.onrender.com`).
7. Confirm `GET https://<your-service>.onrender.com/healthz` returns something like:

   ```json
   {
     "status": "ok",
     "timestamp": "...",
     "interactive_auth_available": false,
     "headless": true,
     "auth_sessions": {"figma": false, "github": false},
     "security": {
       "api_key_required": false,
       "stress_enabled": false,
       "max_request_bytes": 262144,
       "runs_rate_limit": "6/600s",
       "stress_rate_limit": "2/600s"
     }
   }
   ```

**Notes**

- Free web services sleep after idle time; the first request after sleep can take ~30–60s. The hosted UI shows **Waking the runner…** and retries `/healthz` on a short poll (not only “Can’t reach”).
- Chromium is memory-heavy. If runs crash or the service restarts under load, upgrade the plan to **Starter** in the Render dashboard.
- Figma / GitHub interactive login popups do **not** work on cloud (`USABILITY_HEADLESS=true`, no display). Use a public link, pre-warmed `storage_state` from a local machine (`output/sessions/figma.session.json` or `github.session.json`), or run the API locally for authenticated flows. `/healthz` reports `auth_sessions` so the UI can reuse a saved session and skip the login popup. The UI shows a “Sign-in windows only work with a local backend” callout when interactive auth is unavailable.
- First-run tip on Pages: when the API is healthy and the form is empty, **Try a sample public page** loads Playwright’s public TodoMVC demo (no login) so designers can see a full walkthrough without pasting a prototype yet.

### Manual Docker service (no Blueprint)

1. **New** → **Web Service** → connect the same repo.
2. Runtime: **Docker** (Dockerfile at repo root).
3. Health check path: `/healthz`.
4. Set the same env vars as above.
5. Deploy.

## 2. Point GitHub Pages UI at the API

1. In GitHub: repo **Settings** → **Secrets and variables** → **Actions** → **Variables**.
2. Create or update **`VITE_API_BASE`** to the Render HTTPS origin **with no trailing slash**, e.g. `https://your-service.onrender.com` (use the URL from your Render dashboard — not a guessed name).
3. Or via CLI (after Render is live):

   ```bash
   gh variable set VITE_API_BASE --body "https://your-service.onrender.com" -R kmann11/simulated-usability-runner
   ```

4. Re-deploy Pages:
   - **Actions** → **Deploy frontend to GitHub Pages** → **Run workflow**, or
   - Push a change under `frontend/` / the workflow file.
5. Hard-refresh the Pages UI. Health / runs should hit your Render URL (check the browser Network tab).

Until `VITE_API_BASE` is set, the hosted UI calls `/api/...` on github.io, which cannot run the backend.

## 3. API abuse controls (public demo + internal EG)

The Render API is reachable from the internet. Defaults favor a **public Pages demo** without a browser-visible secret:

| Control | Default | Notes |
| --- | --- | --- |
| CORS | Localhost + `https://kmann11.github.io` (+ `CORS_ORIGINS`) | No wildcard `*.github.io` / `*.onrender.com` |
| `POST /runs` + `POST /run` | 6 requests / 10 min / IP | Tunable via `RUNNER_RUNS_*` |
| Request body | Max 256 KiB | `RUNNER_MAX_REQUEST_BYTES` |
| `POST /stress` | **Disabled** when headless | Enable with `RUNNER_STRESS_ENABLED=true` (local/trusted only) |
| Artifacts | Path must resolve under `output/` | Traversal returns 400 |
| `RUNNER_API_KEY` | Unset | If set, mutating routes need `X-Runner-Api-Key` |

### Optional API key (internal only — leaky in Pages)

`RUNNER_API_KEY` on the API + matching `VITE_RUNNER_API_KEY` in the UI build will send `X-Runner-Api-Key` from the browser.

**HOSTING WARNING:** any `VITE_*` value is public in the JS bundle. Anyone can copy it and call `/runs`. Prefer:

1. Leave the key **unset** for the public GitHub Pages demo (rate limit + disabled `/stress` + tight CORS).
2. For internal EG demos, either run the UI locally against a keyed API, or accept that a shared browser key is only a soft gate.

```bash
# API (Render env)
RUNNER_API_KEY="choose-a-long-random-string"

# Local UI or internal Pages build (optional, leaky if published)
VITE_RUNNER_API_KEY="choose-a-long-random-string"
```

Job status polling (`GET /runs/{id}`) stays open so a keyed UI can still poll without extra complexity; create/cancel/auth require the key when configured.

## 4. Optional: Railway

This repo also includes `railway.json` and a `Procfile`. Prefer the Dockerfile on Railway, set `OPENAI_API_KEY` / `USABILITY_HEADLESS=true`, then use the Railway HTTPS URL as `VITE_API_BASE` the same way.

## 5. Local Docker smoke test

```bash
docker build -t sur-api .
docker run --rm -p 8000:8000 -e OPENAI_API_KEY -e USABILITY_HEADLESS=true sur-api
curl -s http://localhost:8000/healthz
# Expect security.stress_enabled=false and api_key_required=false
```
