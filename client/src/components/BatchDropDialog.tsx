import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, CloudUpload, AlertTriangle } from "lucide-react";
import { parseFilenameToFields, AdNameFields } from "@shared/naming";
import { trpc } from "../lib/trpc";

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

/** Compute file health warnings */
function computeWarnings(file: File, dimResult: { ratio: string | null; width: number; height: number } | null): string[] {
  const warnings: string[] = [];
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  if (file.type.startsWith("image/") && file.size > 30 * MB) {
    warnings.push("Too large for Meta (max 30MB)");
  }
  if (file.type.startsWith("video/") && file.size > 4 * GB) {
    warnings.push("Too large for Meta (max 4GB)");
  }
  if (file.type.startsWith("image/") && dimResult && dimResult.ratio === null) {
    warnings.push(`Non-standard aspect ratio (${dimResult.width}×${dimResult.height})`);
  }
  return warnings;
}

/** Compute conceptKey from parsed fields (without dimensions) */
function computeConceptKey(f: Partial<AdNameFields>): string {
  return [
    f.brand ?? "",
    f.initiative ?? "",
    f.variation ?? "",
    f.angle ?? "",
    f.source ?? "",
    f.product ?? "",
    f.contentType ?? "",
    f.creativeType ?? "",
    f.copySlug ?? "",
    f.filename ?? "",
    f.date ?? "",
  ].join("__");
}

interface BatchDropDialogProps {
  files: File[];
  onImport: (rows: ParsedRow[]) => Promise<void>;
  onClose: () => void;
}

const FIELD_COLUMNS: { key: keyof AdNameFields; label: string }[] = [
  { key: "brand", label: "Brand" },
  { key: "initiative", label: "Initiative" },
  { key: "variation", label: "Var." },
  { key: "angle", label: "Angle" },
  { key: "source", label: "Source" },
  { key: "dimensions", label: "Dims" },
  { key: "date", label: "Date" },
  { key: "contentType", label: "Format" },
  { key: "creativeType", label: "Type" },
];

function cellStyle(value: string | undefined): React.CSSProperties {
  if (value && value.trim()) {
    return {
      background: "rgba(46,160,67,0.08)",
      border: "1px solid rgba(46,160,67,0.2)",
      color: "var(--text-primary)",
      borderRadius: "3px",
      padding: "2px 6px",
    };
  }
  return {
    background: "rgba(248,81,73,0.08)",
    border: "1px solid rgba(248,81,73,0.2)",
    color: "var(--text-secondary)",
    borderRadius: "3px",
    padding: "2px 6px",
  };
}

function EditableCell({
  value,
  onChange,
  placeholder,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    onChange(draft);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        style={{
          background: "var(--surface-0)",
          border: "1px solid rgba(0,153,198,0.6)",
          color: "var(--text-primary)",
          borderRadius: "3px",
          padding: "2px 6px",
          fontSize: "11px",
          width: "100%",
          minWidth: "60px",
          outline: "none",
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      />
    );
  }

  return (
    <span
      style={{
        ...cellStyle(value),
        cursor: "pointer",
        display: "inline-block",
        fontSize: "11px",
        fontFamily: "'IBM Plex Sans', sans-serif",
        minWidth: "40px",
        whiteSpace: "nowrap",
      }}
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      title="Click to edit"
    >
      {value && value.trim() ? value : <span style={{ fontStyle: "italic", opacity: 0.5 }}>—</span>}
    </span>
  );
}

export default function BatchDropDialog({
  files,
  onImport,
  onClose,
}: BatchDropDialogProps) {
  const utils = trpc.useUtils();
  const createMut = trpc.queue.create.useMutation();

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Feature 11: get existing queue to detect duplicates
  const { data: existingItems = [] } = trpc.queue.list.useQuery(undefined);
  // Duplicate = same concept AND same dimension already exists
  const existingConceptDims = new Set(
    (existingItems as any[]).map((i: any) => `${i.conceptKey}__${i.dimensions}`)
  );

  // Parse all files on mount
  useEffect(() => {
    let cancelled = false;
    const initialRows: ParsedRow[] = files.map((file) => {
      const fields = parseFilenameToFields(file.name);
      const previewUrl = URL.createObjectURL(file);
      const conceptKey = computeConceptKey(fields);
      return { file, fields, previewUrl, handle: "", conceptKey };
    });
    setRows(initialRows);

    // Detect image dimensions asynchronously, compute warnings, duplicate check
    (async () => {
      const updated = await Promise.all(
        initialRows.map(async (row) => {
          const dimResult = await detectImageDimensions(row.file);
          let updatedFields = { ...row.fields };

          if (dimResult?.ratio && !row.fields.dimensions) {
            updatedFields = { ...updatedFields, dimensions: dimResult.ratio };
          }

          const warnings = computeWarnings(row.file, dimResult);
          const conceptKey = computeConceptKey(updatedFields);
          const compositeKey = `${conceptKey}__${updatedFields.dimensions ?? ""}`;
          const isDuplicate = existingConceptDims.has(compositeKey);

          return { ...row, fields: updatedFields, warnings, isDuplicate, conceptKey };
        })
      );
      if (!cancelled) setRows(updated);
    })();

    // Cleanup preview URLs on unmount
    return () => {
      cancelled = true;
      initialRows.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  function updateField(rowIndex: number, field: keyof AdNameFields, value: string) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIndex) return row;
        const updatedFields = { ...row.fields, [field]: value };
        const conceptKey = computeConceptKey(updatedFields);
        return { ...row, fields: updatedFields, conceptKey };
      })
    );
  }

  function updateHandle(rowIndex: number, value: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === rowIndex ? { ...row, handle: value } : row
      )
    );
  }

  const handleImport = useCallback(async () => {
    setImporting(true);
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Upload file via POST /api/upload
        let fileUrl = "";
        try {
          const formData = new FormData();
          formData.append("file", row.file);
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            fileUrl = data.fileUrl ?? data.url ?? "";
          }
        } catch {
          // upload failed, continue without fileUrl
        }

        const f = row.fields;
        const today = new Date();
        const todayStr = `${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, "0")}`;

        // Feature 1: pass the computed conceptKey so same-concept files auto-group
        const conceptKey = row.conceptKey || computeConceptKey(f);

        await createMut.mutateAsync({
          brand: f.brand || "OIO",
          initiative: f.initiative ?? "",
          variation: f.variation ?? "",
          angle: f.angle ?? "",
          source: f.source ?? "",
          product: f.product || "OIO",
          contentType: f.contentType ?? "",
          creativeType: f.creativeType || "ESTATIC",
          dimensions: f.dimensions ?? "",
          copySlug: f.copySlug ?? "",
          filename: f.filename ?? row.file.name.replace(/\.[^.]+$/, ""),
          date: f.date ?? todayStr,
          fileUrl: fileUrl || null,
          adSetId: "",
          adSetName: "",
          headline: "",
          bodyCopy: "",
          handle: row.handle || null,
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
  }, [rows, onImport, onClose, createMut, utils]);

  const isImage = (file: File) => file.type.startsWith("image/");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--surface-3)",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "1100px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--surface-3)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CloudUpload size={16} style={{ color: "#0099C6" }} />
            <span
              style={{
                fontSize: "15px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "var(--text-primary)",
              }}
            >
              Import {rows.length} {rows.length === 1 ? "file" : "files"}
            </span>
            {rows.some((r) => r.isDuplicate) && (
              <span style={{ fontSize: "11px", color: "#d97706", display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertTriangle size={12} /> {rows.filter((r) => r.isDuplicate).length} duplicate{rows.filter((r) => r.isDuplicate).length !== 1 ? "s" : ""} detected
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            style={{
              color: "var(--text-secondary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "4px",
              borderRadius: "4px",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {importing && progress && (
          <div
            style={{
              flexShrink: 0,
              height: "3px",
              background: "var(--surface-3)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                background: "#0099C6",
                width: `${(progress.done / progress.total) * 100}%`,
                transition: "width 0.2s ease",
              }}
            />
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "11px",
            }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--surface-3)",
              }}
            >
              <tr>
                <th
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    color: "var(--text-muted)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    width: "48px",
                  }}
                >
                  Preview
                </th>
                <th
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    color: "var(--text-muted)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    minWidth: "160px",
                  }}
                >
                  Filename
                </th>
                {FIELD_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      color: "var(--text-muted)",
                      fontSize: "10px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.label}
                  </th>
                ))}
                <th
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    color: "var(--text-muted)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  Handle
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid var(--surface-2)",
                    background: row.isDuplicate ? "rgba(217,119,6,0.04)" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      row.isDuplicate ? "rgba(217,119,6,0.07)" : "rgba(0,153,198,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      row.isDuplicate ? "rgba(217,119,6,0.04)" : "";
                  }}
                >
                  {/* Thumbnail */}
                  <td style={{ padding: "6px 12px", width: "48px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "4px",
                        overflow: "hidden",
                        background: "var(--surface-3)",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isImage(row.file) ? (
                        <img
                          src={row.previewUrl}
                          alt={row.file.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: "9px",
                            color: "var(--text-muted)",
                            fontFamily: "'IBM Plex Mono', monospace",
                          }}
                        >
                          VID
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Filename + badges */}
                  <td
                    style={{
                      padding: "6px 12px",
                      maxWidth: "220px",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: "10px",
                        color: "var(--text-secondary)",
                      }}
                      title={row.file.name}
                    >
                      {row.file.name}
                    </span>
                    {/* Feature 11: duplicate badge */}
                    {row.isDuplicate && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          fontSize: "9px",
                          color: "#d97706",
                          background: "rgba(217,119,6,0.1)",
                          border: "1px solid rgba(217,119,6,0.25)",
                          borderRadius: "3px",
                          padding: "1px 5px",
                          marginTop: "3px",
                        }}
                      >
                        ⚠ Already imported
                      </span>
                    )}
                    {/* Feature 12: health warnings */}
                    {row.warnings && row.warnings.length > 0 && (
                      <div style={{ marginTop: "2px" }}>
                        {row.warnings.map((w, wi) => (
                          <span
                            key={wi}
                            style={{
                              display: "block",
                              fontSize: "9px",
                              color: "#d97706",
                              lineHeight: "1.4",
                            }}
                          >
                            ⚠ {w}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Editable field cells */}
                  {FIELD_COLUMNS.map((col) => (
                    <td key={col.key} style={{ padding: "6px 12px" }}>
                      <EditableCell
                        value={(row.fields as any)[col.key]}
                        onChange={(v) => updateField(i, col.key, v)}
                      />
                    </td>
                  ))}
                  {/* Handle cell */}
                  <td style={{ padding: "6px 12px" }}>
                    <EditableCell
                      value={row.handle}
                      onChange={(v) => updateHandle(i, v)}
                      placeholder="e.g. @creator"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 20px",
            borderTop: "1px solid var(--surface-3)",
            background: "var(--surface-1)",
          }}
        >
          {importing && progress && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginRight: "auto",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              Uploading {progress.done} / {progress.total}…
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            style={{
              padding: "7px 16px",
              fontSize: "13px",
              color: "var(--text-secondary)",
              background: "transparent",
              border: "1px solid var(--surface-3)",
              borderRadius: "6px",
              cursor: "pointer",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || rows.length === 0}
            style={{
              padding: "7px 16px",
              fontSize: "13px",
              fontWeight: 600,
              color: "white",
              background: importing ? "#007a9e" : "#0099C6",
              border: "none",
              borderRadius: "6px",
              cursor: importing || rows.length === 0 ? "not-allowed" : "pointer",
              opacity: importing || rows.length === 0 ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
            onMouseEnter={(e) => {
              if (!importing) (e.currentTarget as HTMLButtonElement).style.background = "#007a9e";
            }}
            onMouseLeave={(e) => {
              if (!importing) (e.currentTarget as HTMLButtonElement).style.background = "#0099C6";
            }}
          >
            {importing ? (
              <>
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                Importing…
              </>
            ) : (
              `Import ${rows.length} ${rows.length === 1 ? "file" : "files"}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
