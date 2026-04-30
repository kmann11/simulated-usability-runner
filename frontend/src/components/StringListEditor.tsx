import { useState } from "react";

interface StringListEditorProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  helperText?: string;
}

export function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  helperText,
}: StringListEditorProps) {
  const [draft, setDraft] = useState("");

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

  return (
    <fieldset className="list-editor">
      <legend>{label}</legend>
      {helperText && <p className="helper">{helperText}</p>}

      <ul>
        {values.map((value, index) => (
          <li key={index}>
            <span className="list-num">{index + 1}.</span>
            <input
              type="text"
              value={value}
              onChange={(event) => updateItem(index, event.target.value)}
            />
            <button
              type="button"
              className="btn-icon"
              onClick={() => removeItem(index)}
              aria-label={`Remove item ${index + 1}`}
              title="Remove"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="row">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
        />
        <button type="button" className="btn-secondary" onClick={addItem} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </fieldset>
  );
}
