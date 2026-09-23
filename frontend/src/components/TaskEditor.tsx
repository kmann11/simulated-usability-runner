import { useState } from "react";
import { TASK_TEMPLATES } from "../taskTemplates";

interface TaskEditorProps {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function TaskEditor({ values, onChange, disabled }: TaskEditorProps) {
  const [draft, setDraft] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  const addItem = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...values, trimmed]);
    setDraft("");
  };

  const removeItem = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, value: string) => {
    onChange(values.map((existing, i) => (i === index ? value : existing)));
  };

  const applyTemplate = (templateId: string) => {
    const template = TASK_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setActiveTemplate(templateId);
    if (values.length === 0 || values.every((task) => !task.trim())) {
      onChange([...template.tasks]);
      return;
    }
    const replace = window.confirm(
      `Replace your current steps with the “${template.label}” example?`,
    );
    if (replace) {
      onChange([...template.tasks]);
    }
  };

  return (
    <div className="task-editor">
      <div className="task-template-row">
        <span className="task-template-label">Start from an example:</span>
        <div className="task-template-chips" role="list">
          {TASK_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              role="listitem"
              className={`task-template-chip${activeTemplate === template.id ? " task-template-chip--active" : ""}`}
              onClick={() => applyTemplate(template.id)}
              disabled={disabled}
              title={template.description}
            >
              {template.label}
            </button>
          ))}
        </div>
      </div>

      {values.length === 0 ? (
        <p className="task-empty-hint muted small">
          Add steps one at a time, like instructions for a usability participant. Example:
          &ldquo;Use the filter chips to find a hotel with 2+ bedrooms.&rdquo;
        </p>
      ) : (
        <ol className="task-step-list">
          {values.map((value, index) => (
            <li key={index}>
              <span className="task-step-num" aria-hidden="true">
                {index + 1}
              </span>
              <input
                type="text"
                value={value}
                onChange={(event) => updateItem(index, event.target.value)}
                disabled={disabled}
                aria-label={`Step ${index + 1}`}
              />
              <button
                type="button"
                className="btn-icon"
                onClick={() => removeItem(index)}
                disabled={disabled}
                aria-label={`Remove step ${index + 1}`}
                title="Remove step"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="task-add-row">
        <input
          type="text"
          value={draft}
          placeholder="Type the next step, then press Enter or Add"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          disabled={disabled}
          aria-label="New step"
        />
        <button type="button" className="btn-secondary" onClick={addItem} disabled={disabled || !draft.trim()}>
          Add step
        </button>
      </div>
    </div>
  );
}
