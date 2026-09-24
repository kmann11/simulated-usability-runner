import { useState } from "react";
import { api, describeError } from "../api/client";
import type { StressResponse } from "../types";
import { MessageList } from "./MessageList";

export function StressPanel() {
  const [outputPrefix, setOutputPrefix] = useState("frontend_smoke");
  const [runsPerPersona, setRunsPerPersona] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.stress(outputPrefix, runsPerPersona);
      setResult(response);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRunning(false);
    }
  };

  const headers = result?.fixtures[0] ? Object.keys(result.fixtures[0]) : [];

  return (
    <section className="card">
      <header className="card-header">
        <h3>Local stress benchmark</h3>
        <p className="muted">
          Runs the bundled HTML fixtures end-to-end. Useful for confirming the runner is healthy
          without hitting a live site. Cloud hosts usually disable this endpoint
          (<code>RUNNER_STRESS_ENABLED</code>); use a local API for stress checks.
        </p>
      </header>

      <form onSubmit={submit} className="grid-2">
        <label>
          <span>Output prefix</span>
          <input
            type="text"
            value={outputPrefix}
            onChange={(event) => setOutputPrefix(event.target.value)}
            disabled={running}
          />
        </label>
        <label>
          <span>Runs per persona</span>
          <input
            type="number"
            min={1}
            max={10}
            value={runsPerPersona}
            onChange={(event) => setRunsPerPersona(Number(event.target.value))}
            disabled={running}
          />
        </label>

        <div className="span-2 actions">
          <button type="submit" className="btn-primary" disabled={running}>
            {running ? "Running benchmark…" : "Run benchmark"}
          </button>
        </div>
      </form>

      {error && <MessageList title="Benchmark error" variant="error" messages={[error]} />}

      {result && (
        <div className="result-block">
          <p className="muted">
            Raw: <code>{result.raw_output}</code>
            <br />
            Summary: <code>{result.summary_output}</code>
          </p>

          {result.fixtures.length === 0 ? (
            <p>No fixture rows returned.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.fixtures.map((row, index) => (
                    <tr key={index}>
                      {headers.map((header) => (
                        <td key={header}>{row[header] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
