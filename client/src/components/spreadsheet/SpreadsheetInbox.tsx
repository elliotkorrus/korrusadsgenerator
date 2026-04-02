import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, Loader2, Trash2, CheckCircle2, Upload, AlertTriangle } from "lucide-react";
import { computeCompleteness } from "../../utils/completeness";

// ─── Types ──────────────────────────────────────────────────────
export interface SpreadsheetItem {
  id: number;
  brand: string;
  initiative: string;
  variation: string;
  angle: string;
  source: string;
  product: string;
  contentType: string;
  creativeType: string;
  dimensions: string;
  copySlug: string;
  filename: string;
  date: string;
  generatedAdName: string;
  fileUrl: string | null;
  status: string;
  handle: string | null;
  agency: string | null;
  adSetName: string | null;
  destinationUrl: string | null;
  cta: string | null;
  conceptKey: string | null;
  [key: string]: any;
}

export interface PendingRow {
  tempId: string;
  file: File;
  previewUrl: string;
  fields: Record<string, string>;
  uploadState: "queued" | "uploading" | "done" | "error";
  conceptGroupKey: string;
}

interface ConceptGroup {
  key: string;
  rows: SpreadsheetItem[];
  shared: SpreadsheetItem;
}

// ─── Column definitions ──────────────────────────────────────────
const COLUMNS: { key: string; label: string; width: string; type: "text" | "select" | "readonly" }[] = [
  { key: "handle", label: "Handle", width: "80px", type: "text" },
  { key: "initiative", label: "Init.", width: "80px", type: "text" },
  { key: "variation", label: "Var.", width: "50px", type: "text" },
  { key: "angle", label: "Theme", width: "100px", type: "select" },
  { key: "creativeType", label: "Style", width: "80px", type: "select" },
  { key: "source", label: "Producer", width: "90px", type: "select" },
  { key: "contentType", label: "Format", width: "70px", type: "select" },
  { key: "product", label: "Product", width: "75px", type: "select" },
  { key: "copySlug", label: "Copy", width: "90px", type: "select" },
  { key: "filename", label: "Filename", width: "100px", type: "text" },
  { key: "date", label: "Date", width: "75px", type: "text" },
  { key: "adSetName", label: "Ad Set", width: "100px", type: "text" },
];

interface Props {
  groups: ConceptGroup[];
  pendingRows: PendingRow[];
  onUpdateField: (conceptKey: string, field: string, value: string) => void;
  onDelete: (ids: number[], label: string) => void;
  onMarkReady: (ids: number[]) => void;
  onOpenDrawer: (id: number) => void;
  fieldOptions: Record<string, { value: string; label: string }[]>;
  angleOptions: { value: string; label: string }[];
  copyOptions: { value: string; label: string }[];
  selectedKeys: Set<string>;
  onToggleSelect: (key: string) => void;
  onToggleAll: () => void;
}

// ─── Completeness dot ─────────────────────────────────────────
function CompletenessDot({ item }: { item: Record<string, any> }) {
  const c = computeCompleteness(item);
  const color = c.level === "green" ? "#4ade80" : c.level === "yellow" ? "#fbbf24" : "#f87171";
  const missing = [...c.missingCritical, ...c.missingOptional];
  return (
    <div className="flex items-center gap-1.5" title={missing.length > 0 ? `Missing: ${missing.join(", ")}` : "Complete"}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
        {Math.round(c.score * 100)}%
      </span>
    </div>
  );
}

// ─── Dimension badges ─────────────────────────────────────────
function DimBadges({ rows }: { rows: SpreadsheetItem[] }) {
  const dimStyles: Record<string, string> = {
    "9:16": "bg-violet-500/10 text-violet-400 border-violet-500/20",
    "4:5": "bg-sky-500/10 text-sky-400 border-sky-500/20",
    "1:1": "bg-teal-500/10 text-teal-400 border-teal-500/20",
    "16:9": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <div className="flex flex-wrap gap-0.5">
      {rows.map((r) => (
        <span
          key={r.id}
          className={`rounded-sm px-1 py-px text-[8px] font-mono font-bold border inline-flex items-center ${dimStyles[r.dimensions] || "bg-zinc-800/50 text-zinc-400 border-zinc-700"}`}
        >
          {r.dimensions}
        </span>
      ))}
    </div>
  );
}

// ─── Cell component ───────────────────────────────────────────
function Cell({
  value,
  field,
  type,
  options,
  isFocused,
  isEditing,
  onFocus,
  onStartEdit,
  onCommit,
  disabled,
}: {
  value: string;
  field: string;
  type: "text" | "select" | "readonly";
  options?: { value: string; label: string }[];
  isFocused: boolean;
  isEditing: boolean;
  onFocus: () => void;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const [editValue, setEditValue] = useState(value);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const filled = value && value.trim();
  const cellBg = filled ? "rgba(46,160,67,0.06)" : "transparent";
  const cellBorder = isFocused ? "1px solid rgba(0,153,198,0.6)" : "1px solid transparent";

  if (type === "readonly") {
    return (
      <td
        className="px-2 py-1 whitespace-nowrap"
        style={{ background: cellBg, outline: cellBorder, outlineOffset: "-1px", fontSize: "11px", color: "var(--text-secondary)" }}
      >
        {value || <span style={{ color: "var(--text-muted)" }}>-</span>}
      </td>
    );
  }

  if (isEditing && !disabled) {
    if (type === "select" && options) {
      return (
        <td className="px-1 py-0.5" style={{ outline: "1px solid rgba(0,153,198,0.6)", outlineOffset: "-1px" }}>
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => { setEditValue(e.target.value); onCommit(e.target.value); }}
            onBlur={() => onCommit(editValue)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditValue(value); onCommit(value); }
            }}
            className="w-full px-1 py-0.5 text-[11px] rounded-sm focus:outline-none"
            style={{ background: "var(--surface-0)", border: "1px solid var(--brand)", color: "var(--text-primary)" }}
          >
            <option value="">-</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </td>
      );
    }
    return (
      <td className="px-1 py-0.5" style={{ outline: "1px solid rgba(0,153,198,0.6)", outlineOffset: "-1px" }}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => onCommit(editValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onCommit(editValue); }
            if (e.key === "Escape") { setEditValue(value); onCommit(value); }
            // Let Tab propagate to parent handler
            if (e.key === "Tab") return;
            e.stopPropagation();
          }}
          className="w-full px-1 py-0.5 text-[11px] rounded-sm focus:outline-none"
          style={{ background: "var(--surface-0)", border: "1px solid var(--brand)", color: "var(--text-primary)", fontFamily: field === "filename" || field === "date" ? "'IBM Plex Mono', monospace" : "inherit" }}
        />
      </td>
    );
  }

  return (
    <td
      className="px-2 py-1 whitespace-nowrap cursor-pointer"
      style={{
        background: cellBg,
        outline: cellBorder,
        outlineOffset: "-1px",
        fontSize: "11px",
        color: filled ? "var(--text-primary)" : "var(--text-muted)",
        fontFamily: field === "filename" || field === "date" ? "'IBM Plex Mono', monospace" : "inherit",
      }}
      onClick={() => { onFocus(); onStartEdit(); }}
      onMouseDown={(e) => { if (e.detail === 1) onFocus(); }}
    >
      {value || <span style={{ opacity: 0.4 }}>-</span>}
    </td>
  );
}

// ─── Main SpreadsheetInbox ────────────────────────────────────
export default function SpreadsheetInbox({
  groups,
  pendingRows,
  onUpdateField,
  onDelete,
  onMarkReady,
  onOpenDrawer,
  fieldOptions,
  angleOptions,
  copyOptions,
  selectedKeys,
  onToggleSelect,
  onToggleAll,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedCell, setFocusedCell] = useState<{ groupIdx: number; colIdx: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ groupIdx: number; colIdx: number } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  function getFieldOptions(field: string): { value: string; label: string }[] | undefined {
    if (field === "angle") return angleOptions;
    if (field === "copySlug") return copyOptions;
    return fieldOptions[field];
  }

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!focusedCell) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let nextCol = focusedCell.colIdx + dir;
      let nextGroup = focusedCell.groupIdx;

      if (nextCol >= COLUMNS.length) { nextCol = 0; nextGroup++; }
      if (nextCol < 0) { nextCol = COLUMNS.length - 1; nextGroup--; }
      if (nextGroup >= 0 && nextGroup < groups.length) {
        // If we're editing, commit first
        setEditingCell(null);
        setFocusedCell({ groupIdx: nextGroup, colIdx: nextCol });
        // Auto-edit on tab into new cell
        setTimeout(() => setEditingCell({ groupIdx: nextGroup, colIdx: nextCol }), 0);
      }
    }

    if (e.key === "Enter" && !editingCell) {
      e.preventDefault();
      setEditingCell(focusedCell);
    }

    if (e.key === "Escape") {
      setEditingCell(null);
    }

    // Arrow keys when not editing
    if (!editingCell) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusedCell.groupIdx + 1, groups.length - 1);
        setFocusedCell({ ...focusedCell, groupIdx: next });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(focusedCell.groupIdx - 1, 0);
        setFocusedCell({ ...focusedCell, groupIdx: next });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(focusedCell.colIdx + 1, COLUMNS.length - 1);
        setFocusedCell({ ...focusedCell, colIdx: next });
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = Math.max(focusedCell.colIdx - 1, 0);
        setFocusedCell({ ...focusedCell, colIdx: next });
      }
    }
  }, [focusedCell, editingCell, groups.length]);

  const handleCommit = useCallback((groupKey: string, field: string, value: string) => {
    onUpdateField(groupKey, field, value);
    setEditingCell(null);
  }, [onUpdateField]);

  const dimColors: Record<string, string> = {
    "9:16": "#8b5cf6",
    "4:5": "#38bdf8",
    "1:1": "#2dd4bf",
    "16:9": "#f59e0b",
  };

  return (
    <div
      ref={containerRef}
      className="min-w-max focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ borderBottom: "1px solid var(--surface-3)" }}
    >
      {/* Pending uploads indicator */}
      {pendingRows.length > 0 && (
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ background: "rgba(0,153,198,0.06)", borderBottom: "1px solid rgba(0,153,198,0.15)" }}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#0099C6" }} />
          <span style={{ fontSize: "11px", color: "#60A7C8" }}>
            Uploading {pendingRows.filter((r) => r.uploadState !== "done").length} file{pendingRows.filter((r) => r.uploadState !== "done").length !== 1 ? "s" : ""}...
          </span>
        </div>
      )}

      <table className="w-full text-xs border-collapse">
        <thead
          className="sticky top-0 z-10"
          style={{ background: "var(--surface-1)", borderBottom: "2px solid var(--surface-2)", boxShadow: "var(--shadow-sm)" }}
        >
          <tr>
            <th className="px-2 py-2 w-7 text-left">
              <input
                type="checkbox"
                checked={groups.length > 0 && selectedKeys.size === groups.length}
                onChange={onToggleAll}
                className="accent-[#0099C6]"
              />
            </th>
            <th className="px-1 py-2 w-5"></th>
            {/* Thumbnail */}
            <th className="px-1 py-2 w-10"></th>
            {/* Sizes */}
            <th
              className="px-2 py-2 text-left uppercase font-semibold whitespace-nowrap"
              style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)", minWidth: "80px" }}
            >
              Sizes
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="px-2 py-2 text-left uppercase font-semibold whitespace-nowrap"
                style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)", minWidth: col.width }}
              >
                {col.label}
              </th>
            ))}
            {/* Completeness */}
            <th
              className="px-2 py-2 text-left uppercase font-semibold"
              style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)", minWidth: "55px" }}
            >
              Score
            </th>
            {/* Actions */}
            <th className="px-2 py-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gIdx) => {
            const { key, rows, shared } = group;
            const isSelected = selectedKeys.has(key);
            const isExpanded = expandedGroups.has(key);
            const isLocked = rows.every((r) => r.status === "uploading" || r.status === "uploaded");

            return (
              <React.Fragment key={key}>
                <tr
                  style={{
                    background: isSelected ? "rgba(0,153,198,0.06)" : undefined,
                    borderBottom: "1px solid var(--surface-2)",
                  }}
                  className="group/row"
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = "rgba(0,153,198,0.02)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  {/* Checkbox */}
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(key)}
                      className="accent-[#0099C6]"
                    />
                  </td>
                  {/* Expand toggle */}
                  <td className="px-1 py-1">
                    {rows.length > 1 && (
                      <button onClick={() => toggleExpand(key)} style={{ color: "var(--text-muted)" }}>
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                    )}
                  </td>
                  {/* Thumbnail */}
                  <td className="px-1 py-1">
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 3,
                        overflow: "hidden",
                        background: shared.fileUrl ? "var(--surface-3)" : (dimColors[shared.dimensions] ? `${dimColors[shared.dimensions]}15` : "var(--surface-3)"),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                      onClick={() => onOpenDrawer(shared.id)}
                    >
                      {shared.fileUrl ? (
                        <img src={shared.fileUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: 7, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>
                          {shared.dimensions?.replace(":", "x") || "?"}
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Sizes */}
                  <td className="px-2 py-1">
                    <DimBadges rows={rows} />
                  </td>
                  {/* Editable cells */}
                  {COLUMNS.map((col, cIdx) => (
                    <Cell
                      key={col.key}
                      value={(shared as any)[col.key] || ""}
                      field={col.key}
                      type={col.type}
                      options={getFieldOptions(col.key)}
                      isFocused={focusedCell?.groupIdx === gIdx && focusedCell?.colIdx === cIdx}
                      isEditing={editingCell?.groupIdx === gIdx && editingCell?.colIdx === cIdx}
                      onFocus={() => setFocusedCell({ groupIdx: gIdx, colIdx: cIdx })}
                      onStartEdit={() => setEditingCell({ groupIdx: gIdx, colIdx: cIdx })}
                      onCommit={(v) => handleCommit(key, col.key, v)}
                      disabled={isLocked}
                    />
                  ))}
                  {/* Completeness */}
                  <td className="px-2 py-1">
                    <CompletenessDot item={shared} />
                  </td>
                  {/* Actions */}
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                      {shared.status === "draft" && (
                        <button
                          onClick={() => onMarkReady(rows.map((r) => r.id))}
                          className="p-1 rounded-sm transition-colors"
                          title="Mark Ready"
                          style={{ color: "#4ade80" }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!isLocked && (
                        <button
                          onClick={() => onDelete(rows.map((r) => r.id), shared.generatedAdName || "this concept")}
                          className="p-1 rounded-sm transition-colors"
                          title="Delete"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded sub-rows for multi-size concepts */}
                {isExpanded && rows.length > 1 && rows.map((row) => (
                  <tr
                    key={row.id}
                    style={{ background: "rgba(0,0,0,0.15)", borderBottom: "1px solid var(--surface-2)" }}
                  >
                    <td></td>
                    <td></td>
                    <td className="px-1 py-1">
                      <div
                        style={{
                          width: 24, height: 24, borderRadius: 2, overflow: "hidden",
                          background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {row.fileUrl ? (
                          <img src={row.fileUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: 6, color: "var(--text-muted)" }}>{row.dimensions?.replace(":", "x")}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[9px] font-mono font-bold border ${
                          ({ "9:16": "bg-violet-500/10 text-violet-400 border-violet-500/20",
                             "4:5": "bg-sky-500/10 text-sky-400 border-sky-500/20",
                             "1:1": "bg-teal-500/10 text-teal-400 border-teal-500/20",
                             "16:9": "bg-amber-500/10 text-amber-400 border-amber-500/20" } as Record<string, string>)[row.dimensions] || "bg-zinc-800/50 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {row.dimensions}
                      </span>
                    </td>
                    <td colSpan={COLUMNS.length + 2} className="px-2 py-1">
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {row.generatedAdName}
                      </span>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
