import { useCatalog } from "../catalog";
import { deriveBehaviorFloats } from "../segments";
import type { ExperimentConfig, Lob } from "../types";
import { PersonaList } from "./PersonaList";
import { StringListEditor } from "./StringListEditor";

// The LOBs we currently surface in the UI, in the order they should appear.
// Keep this list narrow — the backend can carry more LOBs (e.g., b2b_network)
// without the UI having to change.
const LOB_PILL_ORDER = ["expedia", "vrbo", "hotels_com", "partner_central"];

// Consumer LOBs inherit cross-brand segments (Gen Z, High Value); B2B LOBs
// don't. Mirrors the rule in scripts/persona_segments.get_segments_for_lob.
const CONSUMER_LOB_IDS = new Set(["expedia", "vrbo", "hotels_com"]);

export interface RunOptionsState {
  include_heuristics: boolean;
  capture_screenshots: boolean;
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
  const update = <K extends keyof ExperimentConfig>(key: K, value: ExperimentConfig[K]) => {
    onChange({ ...config, [key]: value });
  };
  const updateOption = <K extends keyof RunOptionsState>(key: K, value: RunOptionsState[K]) => {
    onOptionsChange({ ...options, [key]: value });
  };

  // Resolve the pill list to the LOB objects we actually have in the catalog,
  // preserving the authored order. Any missing LOB is silently skipped.
  const lobPills: Lob[] = LOB_PILL_ORDER
    .map((id) => lobs.find((l) => l.id === id))
    .filter((l): l is Lob => Boolean(l));

  const activeLob = config.lob ?? "";

  // Changing the LOB resets the testers to every non-custom segment visible
  // under the new LOB — i.e., brand-scoped segments plus cross-brand ones
  // (Gen Z, High Value) for consumer LOBs. Partner Central ends up empty.
  //
  // Order: brand primary first, then other brand segments, then cross-brand.
  // This mirrors the PersonaList render order so the tester cards line up
  // with the dropdown options.
  const handleLobChange = (nextLob: string) => {
    if (nextLob === activeLob) return;
    const includeCrossBrand = CONSUMER_LOB_IDS.has(nextLob);
    const visible = segments.filter(
      (s) =>
        s.lob === nextLob ||
        (includeCrossBrand && s.scope === "cross_brand"),
    );
    const primary = visible.filter(
      (s) => s.scope !== "cross_brand" && s.is_primary,
    );
    const brand = visible.filter(
      (s) => s.scope !== "cross_brand" && !s.is_primary,
    );
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
      <section className="step">
        <h2>
          <span className="step-num">1</span> What are you testing?
        </h2>
        <div className="grid-2">
          <label>
            <span>Test name</span>
            <input
              type="text"
              value={config.experiment_name}
              onChange={(event) => update("experiment_name", event.target.value)}
              placeholder="e.g. checkout flow"
            />
            <small>Used in the saved results file. Anything is fine.</small>
          </label>
          <label>
            <span>Link</span>
            <input
              type="url"
              value={config.start_url}
              onChange={(event) => update("start_url", event.target.value)}
              placeholder="https://example.com"
            />
            <small>The page the test user starts on.</small>
          </label>
        </div>
      </section>

      <section className="step">
        <h2>
          <span className="step-num">2</span> What are your tasks?
        </h2>
        <p className="muted">
          Add one task per line, in the order someone would do them.
        </p>
        <StringListEditor
          label="Tasks"
          values={config.tasks}
          onChange={(tasks) => update("tasks", tasks)}
          placeholder="e.g. Find a refundable hotel for 2 adults next weekend"
        />
      </section>

      <section className="step">
        <h2>
          <span className="step-num">3</span> Who are your users?
        </h2>
        <p className="muted">
          Pick a research-backed segment to start. You can fine-tune their levers if you want, or
          just go with the defaults.
        </p>

        <div className="lob-pills-group" role="radiogroup" aria-label="Line of business">
          <span className="lob-pills-label">Line of business</span>
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
            Picking a line of business loads a default set of testers for that product area.
            Switching wipes your current testers.
          </small>
        </div>

        <PersonaList
          personas={config.personas}
          onChange={(personas) => update("personas", personas)}
          lob={activeLob}
        />
      </section>

      <section className="step">
        <h2>
          <span className="step-num">4</span> How thorough should the test be?
        </h2>
        <div className="grid-2">
          <label>
            <span>Runs per tester</span>
            <input
              type="number"
              min={1}
              max={10}
              value={config.runs_per_persona}
              onChange={(event) => update("runs_per_persona", Number(event.target.value))}
            />
            <small>How many times each tester tries the flow. More runs = more confidence, but it takes longer.</small>
          </label>
          <label>
            <span>Time limit per run (seconds)</span>
            <input
              type="number"
              min={30}
              max={600}
              value={config.run_timeout_s}
              onChange={(event) => update("run_timeout_s", Number(event.target.value))}
            />
            <small>If a tester can't finish in this much time, we mark it as "gave up".</small>
          </label>
        </div>
      </section>

      <section className="step">
        <h2>
          <span className="step-num">5</span> What do you want back?
        </h2>
        <div className="option-rows">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={options.include_heuristics}
              onChange={(event) => updateOption("include_heuristics", event.target.checked)}
            />
            <span className="toggle-text">
              <strong>Score the flow against design heuristics</strong>
              <small>
                Adds a scorecard with what worked, what didn't, and quick recommendations. Doesn't
                slow the run down.
              </small>
            </span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={options.capture_screenshots}
              onChange={(event) => updateOption("capture_screenshots", event.target.checked)}
            />
            <span className="toggle-text">
              <strong>Take screenshots at each step</strong>
              <small>
                Saves a picture of every step so you can see what the tester saw. Slightly slower
                and uses some disk space.
              </small>
            </span>
          </label>
        </div>
      </section>

      <details className="advanced">
        <summary>Advanced settings</summary>
        <p className="muted">
          Most people don't need to change these. They're here in case you want to fine-tune.
        </p>

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
            <span>Save results to (file path)</span>
            <input
              type="text"
              value={config.output_file}
              onChange={(event) => update("output_file", event.target.value)}
              placeholder="output/checkout_flow.csv"
            />
            <small>A CSV file inside the project. Default is fine.</small>
          </label>
          <label>
            <span>AI model</span>
            <input
              type="text"
              value={config.model}
              onChange={(event) => update("model", event.target.value)}
              placeholder="gpt-4o"
            />
            <small>Only used if an OpenAI key is configured. Otherwise the runner uses a local fallback.</small>
          </label>
        </div>
      </details>
    </fieldset>
  );
}
