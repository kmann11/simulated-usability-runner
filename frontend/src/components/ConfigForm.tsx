import { useMemo, useRef } from "react";
import { useCatalog } from "../catalog";
import {
  DEFAULT_PROTOTYPE_HELP,
  guessPrototypeSource,
  placeholderForPrototypeSource,
  PROTOTYPE_HELP,
  PROTOTYPE_SOURCE_LABEL,
} from "../prototypeSource";
import { buildRunPlanCopy, formatLinkLabel, isValidPrototypeUrl } from "../linkPreview";
import { signInCopyForUrl } from "../prototypeAuth";
import { deriveBehaviorFloats } from "../segments";
import { isPlaceholderStudyName, suggestStudyName } from "../studyNaming";
import type { ExperimentConfig, Lob } from "../types";
import { PersonaList } from "./PersonaList";
import { StringListEditor } from "./StringListEditor";
import { TaskEditor } from "./TaskEditor";

// The LOBs we currently surface in the UI, in the order they should appear.
const LOB_PILL_ORDER = ["expedia", "vrbo", "hotels_com", "partner_central"];

const CONSUMER_LOB_IDS = new Set(["expedia", "vrbo", "hotels_com"]);

export interface RunOptionsState {
  include_heuristics: boolean;
  include_tlx: boolean;
  capture_screenshots: boolean;
  /** When true (default for Figma/GitHub links), open a browser for one-time sign-in before the run. */
  sign_in_before_run?: boolean;
  /** @deprecated Use sign_in_before_run */
  figma_sign_in?: boolean;
}

interface ConfigFormProps {
  config: ExperimentConfig;
  onChange: (config: ExperimentConfig) => void;
  options: RunOptionsState;
  onOptionsChange: (next: RunOptionsState) => void;
  disabled?: boolean;
}

export function ConfigForm({
  config,
  onChange,
  options,
  onOptionsChange,
  disabled,
}: ConfigFormProps) {
  const { lobs, segments } = useCatalog();
  const studyNameTouchedRef = useRef(false);
  const detectedSource = useMemo(
    () => guessPrototypeSource(config.start_url),
    [config.start_url],
  );
  const signInCopy = useMemo(() => signInCopyForUrl(config.start_url), [config.start_url]);

  const update = <K extends keyof ExperimentConfig>(key: K, value: ExperimentConfig[K]) => {
    onChange({ ...config, [key]: value });
  };
  const updateOption = <K extends keyof RunOptionsState>(key: K, value: RunOptionsState[K]) => {
    onOptionsChange({ ...options, [key]: value });
  };

  const maybeSuggestStudyName = () => {
    if (studyNameTouchedRef.current || !isPlaceholderStudyName(config.experiment_name)) return;
    const suggested = suggestStudyName(config.start_url, config.tasks);
    if (suggested) {
      onChange({ ...config, experiment_name: suggested });
    }
  };

  const lobPills: Lob[] = LOB_PILL_ORDER
    .map((id) => lobs.find((l) => l.id === id))
    .filter((l): l is Lob => Boolean(l));

  const activeLob = config.lob ?? "";

  const handleLobChange = (nextLob: string) => {
    if (nextLob === activeLob) return;
    const includeCrossBrand = CONSUMER_LOB_IDS.has(nextLob);
    const visible = segments.filter(
      (s) => s.lob === nextLob || (includeCrossBrand && s.scope === "cross_brand"),
    );
    const primary = visible.filter((s) => s.scope !== "cross_brand" && s.is_primary);
    const brand = visible.filter((s) => s.scope !== "cross_brand" && !s.is_primary);
    const cross = visible.filter((s) => s.scope === "cross_brand");
    const ordered = [...primary, ...brand, ...cross];
    const nextPersonas = ordered.map((seg) => ({
      name: seg.name,
      segment: seg.id,
      levers: { ...seg.levers },
      ...deriveBehaviorFloats(seg.levers),
    }));
    onChange({ ...config, lob: nextLob, personas: nextPersonas });
  };

  return (
    <fieldset className="form" disabled={disabled}>
      <section className="form-guide" aria-label="How this works">
        <h2 className="form-guide-title">Three steps</h2>
        <ol className="form-guide-steps">
          <li>
            <strong>Paste your prototype link</strong>, the page your designer shared.
          </li>
          <li>
            <strong>Write what they should try</strong>, short steps in order.
          </li>
          <li>
            <strong>Run</strong>. We open that link and show where people got stuck.
          </li>
        </ol>
      </section>

      <section className="step step-hero">
        <h2>
          <span className="step-num">1</span> Paste your prototype link
        </h2>
        <p className="muted step-lead">
          The exact page where the test should start: Figma share link, GitHub preview, design preview, or staging.
        </p>

        <div className="prototype-link-block">
          <label>
            <span>Prototype link</span>
            <input
              type="url"
              value={config.start_url}
              onChange={(event) => {
                const nextUrl = event.target.value;
                update("start_url", nextUrl);
                if (signInCopyForUrl(nextUrl) && options.sign_in_before_run === undefined) {
                  onOptionsChange({ ...options, sign_in_before_run: true, figma_sign_in: true });
                }
              }}
              onBlur={maybeSuggestStudyName}
              placeholder={placeholderForPrototypeSource(detectedSource)}
            />
            {detectedSource ? (
              <small className="prototype-detected-tip">
                <span className="prototype-detected-label">
                  Detected: {PROTOTYPE_SOURCE_LABEL[detectedSource]}
                </span>
                {". "}
                {PROTOTYPE_HELP[detectedSource]}
              </small>
            ) : (
              <small>{DEFAULT_PROTOTYPE_HELP}</small>
            )}
          </label>

          {signInCopy && (
            <div className="figma-auth-callout" role="note">
              <p>
                <strong>{signInCopy.calloutTitle}</strong>. {signInCopy.calloutBody}
              </p>
            </div>
          )}
        </div>

        {config.start_url.trim() && (
          <div
            className={`link-ready-banner${isValidPrototypeUrl(config.start_url) ? " link-ready-banner--ok" : " link-ready-banner--warn"}`}
            role="status"
          >
            {isValidPrototypeUrl(config.start_url) ? (
              <>
                <strong>Link looks good.</strong>{" "}
                {buildRunPlanCopy(
                  config.start_url,
                  config.tasks.filter((task) => task.trim()).length,
                  config.personas.length,
                )}
              </>
            ) : (
              <>
                <strong>Check this link.</strong> It should start with{" "}
                <code>https://</code> and open in your browser when you click it.
              </>
            )}
            {isValidPrototypeUrl(config.start_url) && (
              <span className="link-ready-target muted small">
                Opening: {formatLinkLabel(config.start_url)}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="step step-hero">
        <h2>
          <span className="step-num">2</span> What should they try to do?
        </h2>
        <p className="muted step-lead">
          Write like you&apos;re briefing a usability participant: one clear action per step, in
          order.
        </p>
        <TaskEditor
          values={config.tasks}
          disabled={disabled}
          onChange={(tasks) => {
            if (!studyNameTouchedRef.current && isPlaceholderStudyName(config.experiment_name)) {
              const suggested = suggestStudyName(config.start_url, tasks);
              if (suggested) {
                onChange({ ...config, tasks, experiment_name: suggested });
                return;
              }
            }
            update("tasks", tasks);
          }}
        />
      </section>

      <section className="step step-compact">
        <label>
          <span>Study name</span>
          <input
            type="text"
            value={config.experiment_name}
            onChange={(event) => {
              studyNameTouchedRef.current = true;
              update("experiment_name", event.target.value);
            }}
            onBlur={maybeSuggestStudyName}
            placeholder="Auto-filled from your steps or link. Edit anytime."
          />
          <small>For your records when you save or share results. We suggest one if you leave it blank.</small>
        </label>
      </section>

      <section className="step">
        <h2>
          <span className="step-num">3</span> Who should try it?
        </h2>
        <p className="muted step-lead">
          Pick the product and traveler types you care about. Default profiles are fine for a first
          run. You can fine-tune behavior later if needed.
        </p>

        <div className="lob-pills-group" role="radiogroup" aria-label="Product area">
          <span className="lob-pills-label">Product area</span>
          <div className="lob-pills">
            {lobPills.map((lob) => {
              const isActive = lob.id === activeLob;
              return (
                <button
                  key={lob.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`lob-pill${isActive ? " lob-pill--active" : ""}`}
                  onClick={() => handleLobChange(lob.id)}
                >
                  {lob.name}
                </button>
              );
            })}
          </div>
          <small className="muted">
            Which brand or product is this for? Choosing one loads typical testers for that area.
            Switching clears your current tester list.
          </small>
        </div>

        <PersonaList
          personas={config.personas}
          onChange={(personas) => update("personas", personas)}
          lob={activeLob}
        />
      </section>

      <details className="advanced run-options-details">
        <summary>More options (tries, screenshots, success signals)</summary>
        <p className="muted">
          Defaults work for a first run. Open this only if you need to change timing or how we know
          the task is done.
        </p>

        <div className="grid-2">
          <label>
            <span>Tries per traveler type</span>
            <input
              type="number"
              min={1}
              max={10}
              value={config.runs_per_persona}
              onChange={(event) => update("runs_per_persona", Number(event.target.value))}
            />
            <small>2 is a good default. Patterns, not one lucky run.</small>
          </label>
          <label>
            <span>Time limit per try (seconds)</span>
            <input
              type="number"
              min={30}
              max={600}
              value={config.run_timeout_s}
              onChange={(event) => update("run_timeout_s", Number(event.target.value))}
            />
            <small>If they can&apos;t finish in time, we mark it as gave up.</small>
          </label>
        </div>

        <div className="option-rows">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={options.include_heuristics}
              onChange={(event) => updateOption("include_heuristics", event.target.checked)}
            />
            <span className="toggle-text">
              <strong>Design quality scorecard</strong>
              <small>What worked, what felt rough, and quick fixes to consider.</small>
            </span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={options.include_tlx}
              onChange={(event) => updateOption("include_tlx", event.target.checked)}
            />
            <span className="toggle-text">
              <strong>Workload forecast (Synthetic TLX)</strong>
              <small>Directional NASA TLX-style load estimate from the simulated walkthrough.</small>
            </span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={options.capture_screenshots}
              onChange={(event) => updateOption("capture_screenshots", event.target.checked)}
            />
            <span className="toggle-text">
              <strong>Screenshots at each step</strong>
              <small>See what each traveler type saw. Helpful for sharing with designers.</small>
            </span>
          </label>
        </div>

        <h4 className="advanced-subhead">When is the task done?</h4>
        <div className="grid-2">
          <StringListEditor
            label="Words in the page address that mean success"
            values={config.success_criteria.url_contains}
            onChange={(url_contains) =>
              update("success_criteria", { ...config.success_criteria, url_contains })
            }
            placeholder="/checkout"
            helperText="When the address contains any of these, the task is done."
          />
          <StringListEditor
            label="Words on the page that mean success"
            values={config.success_criteria.text_contains}
            onChange={(text_contains) =>
              update("success_criteria", { ...config.success_criteria, text_contains })
            }
            placeholder="Order Summary"
            helperText="If we see any of these words on the page, the task is done."
          />
        </div>

        <div className="grid-2">
          <label>
            <span>Where to save results (for your team&apos;s setup)</span>
            <input
              type="text"
              value={config.output_file}
              onChange={(event) => update("output_file", event.target.value)}
              placeholder="output/checkout_flow.csv"
            />
            <small>Leave as-is unless your team gave you a specific folder.</small>
          </label>
          <label>
            <span>AI assistant (optional)</span>
            <input
              type="text"
              value={config.model}
              onChange={(event) => update("model", event.target.value)}
              placeholder="gpt-4o"
            />
            <small>Only needed if your team configured an AI key. Otherwise we use a built-in fallback.</small>
          </label>
        </div>
      </details>
    </fieldset>
  );
}
