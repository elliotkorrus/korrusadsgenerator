import { useState, useRef, useEffect } from "react";

interface InlineTextProps {
  value: string;
  onSave: (val: string) => void;
  disabled?: boolean;
  className?: string;
  mono?: boolean;
  placeholder?: string;
}

export function InlineText({ value, onSave, disabled, className, mono, placeholder }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (disabled) {
    return <span className={`${className || ""} ${mono ? "font-mono" : ""}`}>{value || "—"}</span>;
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={`cursor-pointer px-1 -mx-1 rounded ${className || ""} ${mono ? "font-mono" : ""}`}
        style={{ transition: "background 0.1s" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.background = "var(--surface-2)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.background = "transparent"; }}
      >
        {value || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{placeholder || "—"}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }
        if (e.key === "Escape") {
          setEditing(false);
          setDraft(value);
        }
      }}
      className={`rounded px-1.5 py-0.5 text-sm w-full outline-none ${mono ? "font-mono" : ""}`}
      style={{ background: "var(--surface-0)", border: "1px solid rgba(0,153,198,0.4)", color: "var(--text-primary)" }}
    />
  );
}

interface InlineSelectProps {
  value: string;
  options: { value: string; label: string }[];
  onSave: (val: string) => void;
  disabled?: boolean;
}

export function InlineSelect({ value, options, onSave, disabled }: InlineSelectProps) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);

  const label = options.find((o) => o.value === value)?.label || value;

  if (disabled) {
    return <span>{label || "—"}</span>;
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer px-1 -mx-1 rounded"
        style={{ transition: "background 0.1s" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.background = "var(--surface-2)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.background = "transparent"; }}
      >
        {label || <span style={{ color: "var(--text-muted)" }}>—</span>}
      </span>
    );
  }

  return (
    <select
      ref={selectRef}
      value={value}
      onChange={(e) => {
        onSave(e.target.value);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      className="rounded px-1 py-0.5 text-sm outline-none"
      style={{ background: "var(--surface-0)", border: "1px solid rgba(0,153,198,0.4)", color: "var(--text-primary)" }}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
