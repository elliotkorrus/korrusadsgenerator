import React from "react";
import { RotateCcw, ToggleLeft, ToggleRight } from "lucide-react";
import type { StickyDefaults } from "../hooks/useStickyDefaults";

interface Props {
  defaults: StickyDefaults;
  onSetDefault: (field: string, value: string) => void;
  onToggleDefault: (field: string, enabled: boolean) => void;
  onReset: () => void;
  fieldOptions: Record<string, { value: string; label: string }[]>;
  angleOptions: { value: string; label: string }[];
  copyOptions: { value: string; label: string }[];
}

const FIELD_META: { key: string; label: string; type: "text" | "select"; placeholder?: string }[] = [
  { key: "initiative", label: "Initiative", type: "text", placeholder: "s_001" },
  { key: "variation", label: "Variation", type: "text", placeholder: "v1" },
  { key: "angle", label: "Theme", type: "select" },
  { key: "creativeType", label: "Style", type: "select" },
  { key: "source", label: "Producer", type: "select" },
  { key: "product", label: "Product", type: "select" },
  { key: "copySlug", label: "Copy", type: "select" },
  { key: "date", label: "Date", type: "text", placeholder: "0402" },
  { key: "agency", label: "Agency", type: "text", placeholder: "Internal" },
];

export default function StickyDefaultsBar({ defaults, onSetDefault, onToggleDefault, onReset, fieldOptions, angleOptions, copyOptions }: Props) {
  function getOptions(field: string): { value: string; label: string }[] | undefined {
    if (field === "angle") return angleOptions;
    if (field === "copySlug") return copyOptions;
    return fieldOptions[field];
  }

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 flex-wrap"
      style={{ borderBottom: "1px solid rgba(0,153,198,0.15)", background: "rgba(0,153,198,0.03)" }}
    >
      <span
        className="text-[10px] font-semibold uppercase mr-1"
        style={{ letterSpacing: "0.08em", color: "#60A7C8", whiteSpace: "nowrap" }}
      >
        Session Defaults
      </span>

      {FIELD_META.map(({ key, label, type, placeholder }) => {
        const def = defaults[key];
        const enabled = def?.enabled ?? false;
        const value = def?.value ?? "";
        const opts = getOptions(key);

        return (
          <div
            key={key}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-all"
            style={{
              background: enabled ? "rgba(0,153,198,0.08)" : "transparent",
              border: enabled ? "1px solid rgba(0,153,198,0.2)" : "1px solid transparent",
              opacity: enabled ? 1 : 0.5,
            }}
          >
            <button
              onClick={() => onToggleDefault(key, !enabled)}
              className="flex-shrink-0"
              style={{ color: enabled ? "#0099C6" : "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
              title={enabled ? "Disable default" : "Enable default"}
            >
              {enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            </button>
            <label className="text-[9px] font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{label}</label>
            {type === "select" && opts ? (
              <select
                value={value}
                onChange={(e) => { onSetDefault(key, e.target.value); if (!enabled) onToggleDefault(key, true); }}
                className="px-1 py-0.5 rounded-sm text-[10px] focus:outline-none"
                style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", color: "var(--text-primary)", maxWidth: "85px" }}
              >
                <option value="">-</option>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => { onSetDefault(key, e.target.value); if (!enabled && e.target.value) onToggleDefault(key, true); }}
                placeholder={placeholder}
                className="px-1 py-0.5 rounded-sm text-[10px] focus:outline-none"
                style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", color: "var(--text-primary)", width: "65px" }}
              />
            )}
          </div>
        );
      })}

      <button
        onClick={onReset}
        className="flex items-center gap-1 text-[10px] ml-auto transition-colors"
        style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
        title="Reset defaults"
      >
        <RotateCcw className="w-3 h-3" /> Reset
      </button>
    </div>
  );
}
