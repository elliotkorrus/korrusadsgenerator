import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, CloudUpload, AlertTriangle, ChevronDown } from "lucide-react";
import { parseFilenameToFields, AdNameFields } from "@shared/naming";
import { trpc } from "../lib/trpc";
import { useFieldOptions } from "../hooks/useFieldOptions";

export interface ParsedRow {
  file: File;
  fields: Partial<AdNameFields>;
  previewUrl: string;
  handle?: string;
  isDuplicate?: boolean;
  warnings?: string[];
  conceptKey?: string;
}

async function detectImageDimensions(file: File): Promise<{ ratio: string | null; width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.width;
      const h = img.height;
      const ratio = w / h;
      let detected: string | null = null;
      if (Math.abs(ratio - 9 / 16) < 0.08) detected = "9:16";
      else if (Math.abs(ratio - 4 / 5) < 0.08) detected = "4:5";
      else if (Math.abs(ratio - 1 / 1) < 0.08) detected = "1:1";
      else if (Math.abs(ratio - 16 / 9) < 0.08) detected = "16:9";
      resolve({ ratio: detected, width: w, height: h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function computeWarnings(file: File, dimResult: { ratio: string | null; width: number; height: number } | null): string[] {
  const warnings: string[] = [];
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  if (file.type.startsWith("image/") && file.size > 30 * MB) warnings.push("Too large for Meta (max 30MB)");
  if (file.type.startsWith("video/") && file.size > 4 * GB) warnings.push("Too large for Meta (max 4GB)");
  if (file.type.startsWith("image/") && dimResult && dimResult.ratio === null) warnings.push(`Non-standard ratio (${dimResult.width}×${dimResult.height})`);
  return warnings;
}

function computeConceptKey(f: Partial<AdNameFields>): string {
  return [f.brand ?? "", f.initiative ?? "", f.variation ?? "", f.angle ?? "", f.source ?? "", f.product ?? "", f.contentType ?? "", f.creativeType ?? "", f.copySlug ?? "", f.filename ?? "", f.date ?? ""].join("__");
}

// Detect video dimensions from aspect ratio in filename
function detectVideoDimensions(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (/9.?16|9x16|vertical|story|stories|reel/.test(lower)) return "9:16";
  if (/4.?5|4x5/.test(lower)) return "4:5";
  if (/1.?1|1x1|square/.test(lower)) return "1:1";
  if (/16.?9|16x9|horizontal|landscape|wide/.test(lower)) return "16:9";
  return null;
}

interface BatchDropDialogProps {
  files: File[];
  onImport: (rows: ParsedRow[]) => Promise<void>;
  onClose: () => void;
}

const FIELD_COLUMNS: { key: keyof AdNameFields; label: string; width?: string }[] = [
  { key: "brand", label: "Brand", width: "70px" },
  { key: "initiative", label: "Initiative", width: "90px" },
  { key: "variation", label: "Var.", width: "50px" },
  { key: "angle", label: "Angle", width: "100px" },
  { key: "source", label: "Source", width: "100px" },
  { key: "product", label: "Product", width: "80px" },
  { key: "copySlug", label: "Copy Slug", width: "100px" },
  { key: "dimensions", label: "Dims", width: "65px" },
  { key: "date", label: "Date", width: "80px" },
  { key: "contentType", label: "Format", width: "70px" },
  { key: "creativeType", label: "Type", width: "80px" },
];

// Fields that get dropdown selects
const SELECT_FIELDS = new Set(["source", "angle", "contentType", "creativeType", "dimensions", "product", "copySlug"]);

function cellStyle(value: string | undefined): React.CSSProperties {
  if (value && value.trim()) {
    return { background: "rgba(46,160,67,0.08)", border: "1px solid rgba(46,160,67,0.2)", color: "var(--text-primary)", borderRadius: "3px", padding: "2px 6px" };
  }
  return { background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.2)", color: "var(--text-secondary)", borderRadius: "3px", padding: "2px 6px" };
}

function EditableCell({ value, onChange, placeholder }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);

  function commit() { setEditing(false); onChange(draft); }

  if (editing) {
    return (
      <input ref={inputRef} value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
        style={{ background: "var(--surface-0)", border: "1px solid rgba(0,153,198,0.6)", color: "var(--text-primary)", borderRadius: "3px", padding: "2px 6px", fontSize: "11px", width: "100%", minWidth: "60px", outline: "none", fontFamily: "'IBM Plex Sans', sans-serif" }}
      />
    );
  }

  return (
    <span style={{ ...cellStyle(value), cursor: "pointer", display: "inline-block", fontSize: "11px", fontFamily: "'IBM Plex Sans', sans-serif", minWidth: "40px", whiteSpace: "nowrap" }}
      onClick={() => { setDraft(value ?? ""); setEditing(true); }} title="Click to edit">
      {value && value.trim() ? value : <span style={{ fontStyle: "italic", opacity: 0.5 }}>—</span>}
    </span>
  );
}

function SelectCell({ value, options, onChange }: { value: string | undefined; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", minWidth: "60px" }}>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...cellStyle(value),
          appearance: "none",
          cursor: "pointer",
          fontSize: "11px",
          fontFamily: "'IBM Plex Sans', sans-serif",
          paddingRight: "18px",
          width: "100%",
          outline: "none",
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={10} style={{ position: "absolute", right: "4px", pointerEvents: "none", color: "var(--text-muted)" }} />
    </div>
  );
}

export default function BatchDropDialog({ files, onImport, onClose }: BatchDropDialogProps) {
  const utils = trpc.useUtils();
  const createMut = trpc.queue.create.useMutation();
  const { data: metaDefaults } = trpc.meta.get.useQuery();
  const { data: copyEntries = [] } = trpc.copy.list.useQuery(undefined);

  // Field options for dropdowns
  const fieldOptions = useFieldOptions();
  const sourceOpts = fieldOptions.filter((o: any) => o.field === "source" && o.isActive).map((o: any) => ({ value: o.value, label: o.label || o.value }));
  const contentTypeOpts = fieldOptions.filter((o: any) => o.field === "contentType" && o.isActive).map((o: any) => ({ value: o.value, label: o.label || o.value }));
  const creativeTypeOpts = fieldOptions.filter((o: any) => o.field === "creativeType" && o.isActive).map((o: any) => ({ value: o.value, label: o.label || o.value }));
  const angleOpts = fieldOptions.filter((o: any) => o.field === "angle" && o.isActive).map((o: any) => ({ value: o.value, label: o.label || o.value }));
  const productOpts = fieldOptions.filter((o: any) => o.field === "product" && o.isActive).map((o: any) => ({ value: o.value, label: o.label || o.value }));
  const dimsOpts = [{ value: "9:16", label: "9:16" }, { value: "4:5", label: "4:5" }, { value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }];
  const copySlugOpts = (copyEntries as any[]).filter((c: any) => c.status === "active").map((c: any) => ({ value: c.copySlug, label: c.copySlug }));

  const optionsMap: Record<string, { value: string; label: string }[]> = {
    source: sourceOpts,
    angle: angleOpts,
    contentType: contentTypeOpts,
    creativeType: creativeTypeOpts,
    dimensions: dimsOpts,
    product: productOpts,
    copySlug: copySlugOpts,
  };

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Bulk defaults — apply to ALL rows
  const [bulkDefaults, setBulkDefaults] = useState<Partial<AdNameFields> & { handle?: string; agency?: string }>({
    brand: "OIO",
    initiative: "",
    variation: "V1",
    angle: "",
    source: "",
    product: "OIO",
    contentType: "",
    creativeType: "",
    dimensions: "",
    copySlug: "",
    date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })(),
    agency: "",
  });

  const { data: existingItems = [] } = trpc.queue.list.useQuery(undefined);
  const existingConceptDims = new Set((existingItems as any[]).map((i: any) => `${i.conceptKey}__${i.dimensions}`));

  // Parse files on mount
  useEffect(() => {
    let cancelled = false;
    const initialRows: ParsedRow[] = files.map((file) => {
      const fields = parseFilenameToFields(file.name);
      // Also try video dimension detection from filename
      if (!fields.dimensions && file.type.startsWith("video/")) {
        const videoDims = detectVideoDimensions(file.name);
        if (videoDims) fields.dimensions = videoDims;
      }
      const previewUrl = URL.createObjectURL(file);
      const conceptKey = computeConceptKey(fields);
      return { file, fields, previewUrl, handle: metaDefaults?.instagramHandle || "", conceptKey };
    });
    setRows(initialRows);

    // Detect image dimensions async
    (async () => {
      const updated = await Promise.all(
        initialRows.map(async (row) => {
          const dimResult = await detectImageDimensions(row.file);
          let updatedFields = { ...row.fields };
          if (dimResult?.ratio && !row.fields.dimensions) updatedFields = { ...updatedFields, dimensions: dimResult.ratio };
          const warnings = computeWarnings(row.file, dimResult);
          const conceptKey = computeConceptKey(updatedFields);
          const compositeKey = `${conceptKey}__${updatedFields.dimensions ?? ""}`;
          const isDuplicate = existingConceptDims.has(compositeKey);
          return { ...row, fields: updatedFields, warnings, isDuplicate, conceptKey };
        })
      );
      if (!cancelled) setRows(updated);
    })();

    return () => { cancelled = true; initialRows.forEach((r) => URL.revokeObjectURL(r.previewUrl)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  function updateField(rowIndex: number, field: keyof AdNameFields, value: string) {
    setRows((prev) => prev.map((row, i) => {
      if (i !== rowIndex) return row;
      const updatedFields = { ...row.fields, [field]: value };
      const conceptKey = computeConceptKey(updatedFields);
      return { ...row, fields: updatedFields, conceptKey };
    }));
  }

  function updateHandle(rowIndex: number, value: string) {
    setRows((prev) => prev.map((row, i) => i === rowIndex ? { ...row, handle: value } : row));
  }

  // Apply a bulk default to all rows (for a single field)
  function applyBulkToAll(field: keyof AdNameFields, value: string) {
    setBulkDefaults((prev) => ({ ...prev, [field]: value }));
    if (value) {
      setRows((prev) => prev.map((row) => {
        const updatedFields = { ...row.fields, [field]: value };
        const conceptKey = computeConceptKey(updatedFields);
        return { ...row, fields: updatedFields, conceptKey };
      }));
    }
  }

  const handleImport = useCallback(async () => {
    setImporting(true);
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let fileUrl = "";
        try {
          const formData = new FormData();
          formData.append("file", row.file);
          const token = localStorage.getItem("app-token");
          const res = await fetch("/api/upload", { method: "POST", body: formData, headers: token ? { "x-app-token": token } : {} });
          if (res.ok) { const data = await res.json(); fileUrl = data.fileUrl ?? ""; }
        } catch { /* continue */ }

        const f = row.fields;
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const conceptKey = row.conceptKey || computeConceptKey(f);

        // Resolve copy from slug
        const copySlug = f.copySlug || bulkDefaults.copySlug || "";
        const copyEntry = copySlug ? (copyEntries as any[]).find((c: any) => c.copySlug === copySlug) : null;

        await createMut.mutateAsync({
          brand: f.brand || bulkDefaults.brand || "OIO",
          initiative: f.initiative || bulkDefaults.initiative || "",
          variation: f.variation || bulkDefaults.variation || "",
          angle: f.angle || bulkDefaults.angle || "",
          source: f.source || bulkDefaults.source || "",
          product: f.product || bulkDefaults.product || "OIO",
          contentType: f.contentType || bulkDefaults.contentType || "",
          creativeType: f.creativeType || bulkDefaults.creativeType || "ESTATIC",
          dimensions: f.dimensions || bulkDefaults.dimensions || "",
          copySlug: copySlug,
          filename: f.filename ?? row.file.name.replace(/\.[^.]+$/, ""),
          date: f.date || bulkDefaults.date || todayStr,
          fileUrl: fileUrl || null,
          adSetId: "",
          adSetName: "",
          headline: copyEntry?.headline || "",
          bodyCopy: copyEntry?.bodyCopy || "",
          handle: row.handle || metaDefaults?.instagramHandle || null,
          cta: metaDefaults?.defaultCta || "SHOP_NOW",
          displayUrl: metaDefaults?.defaultDisplayUrl || null,
          destinationUrl: metaDefaults?.defaultDestinationUrl || null,
          agency: bulkDefaults.agency || null,
          conceptKey,
        });

        setProgress({ done: i + 1, total: rows.length });
      }
      utils.queue.list.invalidate();
      await onImport(rows);
      onClose();
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }, [rows, bulkDefaults, copyEntries, metaDefaults, onImport, onClose, createMut, utils]);

  const isImage = (file: File) => file.type.startsWith("image/");

  function renderCell(row: ParsedRow, rowIndex: number, col: typeof FIELD_COLUMNS[number]) {
    const val = (row.fields as any)[col.key];
    if (SELECT_FIELDS.has(col.key) && optionsMap[col.key]) {
      return <SelectCell value={val} options={optionsMap[col.key]} onChange={(v) => updateField(rowIndex, col.key, v)} />;
    }
    return <EditableCell value={val} onChange={(v) => updateField(rowIndex, col.key, v)} />;
  }

  function renderBulkCell(col: typeof FIELD_COLUMNS[number]) {
    const val = (bulkDefaults as any)[col.key] || "";
    if (SELECT_FIELDS.has(col.key) && optionsMap[col.key]) {
      return <SelectCell value={val} options={optionsMap[col.key]} onChange={(v) => applyBulkToAll(col.key, v)} />;
    }
    return <EditableCell value={val} onChange={(v) => applyBulkToAll(col.key, v)} placeholder="Set all" />;
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", borderRadius: "8px", width: "100%", maxWidth: "1100px", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--surface-3)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CloudUpload size={16} style={{ color: "#0099C6" }} />
            <span style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
              Import {rows.length} {rows.length === 1 ? "file" : "files"}
            </span>
            {rows.some((r) => r.isDuplicate) && (
              <span style={{ fontSize: "11px", color: "#d97706", display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertTriangle size={12} /> {rows.filter((r) => r.isDuplicate).length} duplicate{rows.filter((r) => r.isDuplicate).length !== 1 ? "s" : ""} detected
              </span>
            )}
          </div>
          <button onClick={onClose} disabled={importing} style={{ color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer", padding: "4px", borderRadius: "4px" }}>
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {importing && progress && (
          <div style={{ flexShrink: 0, height: "3px", background: "var(--surface-3)", position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", background: "#0099C6", width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.2s ease" }} />
          </div>
        )}

        {/* Bulk defaults bar */}
        <div style={{ flexShrink: 0, padding: "8px 20px", borderBottom: "1px solid var(--surface-3)", background: "rgba(0,153,198,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0099C6", whiteSpace: "nowrap" }}>
              Set all rows:
            </span>
            {FIELD_COLUMNS.filter(c => SELECT_FIELDS.has(c.key)).map((col) => (
              <div key={col.key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{col.label}:</span>
                <SelectCell value={(bulkDefaults as any)[col.key] || ""} options={optionsMap[col.key] || []} onChange={(v) => applyBulkToAll(col.key, v)} />
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Agency:</span>
              <input
                type="text"
                value={bulkDefaults.agency || ""}
                onChange={(e) => setBulkDefaults((p) => ({ ...p, agency: e.target.value }))}
                placeholder="e.g. Agency A"
                style={{ width: "90px", padding: "3px 6px", fontSize: "11px", background: "var(--surface-1)", border: "1px solid var(--surface-3)", borderRadius: "4px", color: "var(--text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--surface-2)", borderBottom: "1px solid var(--surface-3)" }}>
              <tr>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap", width: "48px" }}>Preview</th>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap", minWidth: "160px" }}>Filename</th>
                {FIELD_COLUMNS.map((col) => (
                  <th key={col.key} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap", width: col.width }}>
                    {col.label}
                  </th>
                ))}
                <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>Handle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--surface-2)", background: row.isDuplicate ? "rgba(217,119,6,0.04)" : undefined }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = row.isDuplicate ? "rgba(217,119,6,0.07)" : "rgba(0,153,198,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = row.isDuplicate ? "rgba(217,119,6,0.04)" : ""; }}>
                  {/* Thumbnail */}
                  <td style={{ padding: "6px 12px", width: "48px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "4px", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isImage(row.file) ? (
                        <img src={row.previewUrl} alt={row.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>VID</span>
                      )}
                    </div>
                  </td>
                  {/* Filename */}
                  <td style={{ padding: "6px 12px", maxWidth: "220px" }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "var(--text-secondary)" }} title={row.file.name}>
                      {row.file.name}
                    </span>
                    {row.isDuplicate && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "9px", color: "#d97706", background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: "3px", padding: "1px 5px", marginTop: "3px" }}>
                        ⚠ Already imported
                      </span>
                    )}
                    {row.warnings && row.warnings.length > 0 && (
                      <div style={{ marginTop: "2px" }}>
                        {row.warnings.map((w, wi) => (
                          <span key={wi} style={{ display: "block", fontSize: "9px", color: "#d97706", lineHeight: "1.4" }}>⚠ {w}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Field cells — dropdowns for select fields, text for others */}
                  {FIELD_COLUMNS.map((col) => (
                    <td key={col.key} style={{ padding: "6px 8px" }}>
                      {renderCell(row, i, col)}
                    </td>
                  ))}
                  {/* Handle */}
                  <td style={{ padding: "6px 8px" }}>
                    <EditableCell value={row.handle} onChange={(v) => updateHandle(i, v)} placeholder="@creator" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom bar */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", padding: "12px 20px", borderTop: "1px solid var(--surface-3)", background: "var(--surface-1)" }}>
          {importing && progress && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginRight: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              Uploading {progress.done} / {progress.total}…
            </span>
          )}
          <button type="button" onClick={onClose} disabled={importing}
            style={{ padding: "7px 16px", fontSize: "13px", color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--surface-3)", borderRadius: "6px", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}>
            Cancel
          </button>
          <button type="button" onClick={handleImport} disabled={importing || rows.length === 0}
            style={{ padding: "7px 16px", fontSize: "13px", fontWeight: 600, color: "white", background: importing ? "#007a9e" : "#0099C6", border: "none", borderRadius: "6px", cursor: importing || rows.length === 0 ? "not-allowed" : "pointer", opacity: importing || rows.length === 0 ? 0.7 : 1, display: "flex", alignItems: "center", gap: "6px", fontFamily: "'IBM Plex Sans', sans-serif" }}
            onMouseEnter={(e) => { if (!importing) (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
            onMouseLeave={(e) => { if (!importing) (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}>
            {importing ? (<><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Importing…</>) : (`Import ${rows.length} ${rows.length === 1 ? "file" : "files"}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
