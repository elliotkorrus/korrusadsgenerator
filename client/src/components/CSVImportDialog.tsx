import React, { useState, useRef, useCallback } from "react";
import { trpc } from "../lib/trpc";
import { generateAdName } from "@shared/naming";
import {
  FileSpreadsheet,
  Upload,
  X,
  Check,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                 */
/* ------------------------------------------------------------------ */

interface CSVImportDialogProps {
  onImport: () => void;
  onClose: () => void;
}

const MAPPABLE_FIELDS = [
  { key: "skip", label: "\u2014 Skip \u2014" },
  { key: "brand", label: "Brand" },
  { key: "initiative", label: "Initiative" },
  { key: "variation", label: "Variation" },
  { key: "angle", label: "Theme" },
  { key: "source", label: "Producer" },
  { key: "product", label: "Product" },
  { key: "contentType", label: "Ad Format (VID/IMG/CAR)" },
  { key: "creativeType", label: "Creative Style" },
  { key: "dimensions", label: "Dimensions" },
  { key: "copySlug", label: "Copy Slug" },
  { key: "filename", label: "Filename" },
  { key: "date", label: "Date" },
  { key: "adSetId", label: "Ad Set ID" },
  { key: "adSetName", label: "Ad Set Name" },
  { key: "destinationUrl", label: "Destination URL" },
  { key: "headline", label: "Headline" },
  { key: "bodyCopy", label: "Body Copy" },
  { key: "handle", label: "Handle" },
  { key: "cta", label: "CTA" },
  { key: "displayUrl", label: "Display URL" },
  { key: "fileUrl", label: "File URL" },
] as const;

type MappableKey = (typeof MAPPABLE_FIELDS)[number]["key"];

type Step = "upload" | "map" | "preview";

/* ------------------------------------------------------------------ */
/*  CSV parser                                                        */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];
    while (i < len) {
      let value = "";

      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              // Escaped quote
              value += '"';
              i += 2;
            } else {
              // Closing quote
              i++; // skip closing quote
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
        // Skip past comma or newline after closing quote
        if (i < len && text[i] === ",") {
          i++;
          row.push(value);
          continue;
        }
      } else {
        // Unquoted field
        while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          value += text[i];
          i++;
        }
        if (i < len && text[i] === ",") {
          i++;
          row.push(value);
          continue;
        }
      }

      row.push(value);
      break;
    }

    // Skip line endings
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;

    // Skip empty trailing rows
    if (row.length > 0 && !(row.length === 1 && row[0] === "")) {
      rows.push(row);
    }
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Auto-mapping: fuzzy match CSV headers -> target fields            */
/* ------------------------------------------------------------------ */

const HEADER_ALIASES: Record<string, MappableKey> = {
  brand: "brand",
  initiative: "initiative",
  campaign: "initiative",
  variation: "variation",
  variant: "variation",
  version: "variation",
  angle: "angle",
  source: "source",
  product: "product",
  "content type": "contentType",
  contenttype: "contentType",
  format: "contentType",
  "creative type": "creativeType",
  creativetype: "creativeType",
  type: "creativeType",
  dimensions: "dimensions",
  dimension: "dimensions",
  dims: "dimensions",
  size: "dimensions",
  "aspect ratio": "dimensions",
  "copy slug": "copySlug",
  copyslug: "copySlug",
  copy: "copySlug",
  filename: "filename",
  file: "filename",
  "file name": "filename",
  date: "date",
  "ad set id": "adSetId",
  adsetid: "adSetId",
  "ad set": "adSetId",
  "ad set name": "adSetName",
  adsetname: "adSetName",
  "destination url": "destinationUrl",
  destinationurl: "destinationUrl",
  url: "destinationUrl",
  "landing page": "destinationUrl",
  headline: "headline",
  title: "headline",
  "body copy": "bodyCopy",
  bodycopy: "bodyCopy",
  body: "bodyCopy",
  description: "bodyCopy",
  "primary text": "bodyCopy",
  handle: "handle",
  "instagram handle": "handle",
  cta: "cta",
  "call to action": "cta",
  "display url": "displayUrl",
  displayurl: "displayUrl",
  "file url": "fileUrl",
  fileurl: "fileUrl",
  "asset url": "fileUrl",
  "media url": "fileUrl",
};

function autoMapHeader(header: string): MappableKey {
  const normalized = header.trim().toLowerCase().replace(/[_\-]/g, " ");
  if (HEADER_ALIASES[normalized]) return HEADER_ALIASES[normalized];

  // Try partial matching
  for (const [alias, key] of Object.entries(HEADER_ALIASES)) {
    if (normalized.includes(alias) || alias.includes(normalized)) {
      return key;
    }
  }

  return "skip";
}

/* ------------------------------------------------------------------ */
/*  Shared inline styles                                              */
/* ------------------------------------------------------------------ */

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "rgba(0,0,0,0.75)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};

const dialogStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--surface-3)",
  borderRadius: "8px",
  width: "100%",
  maxWidth: "960px",
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid var(--surface-3)",
  flexShrink: 0,
};

const footerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  padding: "12px 20px",
  borderTop: "1px solid var(--surface-3)",
  background: "var(--surface-1)",
};

const btnSecondary: React.CSSProperties = {
  padding: "7px 16px",
  fontSize: "13px",
  color: "var(--text-secondary)",
  background: "transparent",
  border: "1px solid var(--surface-3)",
  borderRadius: "6px",
  cursor: "pointer",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const btnPrimary: React.CSSProperties = {
  padding: "7px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "white",
  background: "#0099C6",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function CSVImportDialog({ onImport, onClose }: CSVImportDialogProps) {
  const utils = trpc.useUtils();
  const createMut = trpc.queue.create.useMutation();

  // State
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<MappableKey[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: number } | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- File handling ---- */

  const processFile = useCallback((file: File) => {
    setFileError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Please select a CSV file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text || !text.trim()) {
        setFileError("File is empty.");
        return;
      }

      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        setFileError("CSV must have at least a header row and one data row.");
        return;
      }

      const headers = parsed[0];
      const dataRows = parsed.slice(1);

      setCsvHeaders(headers);
      setCsvRows(dataRows);

      // Auto-map columns
      const mapped = headers.map((h) => autoMapHeader(h));

      // Deduplicate: if two columns map to the same field, keep first, skip rest
      const seen = new Set<MappableKey>();
      const deduped = mapped.map((key) => {
        if (key === "skip") return key;
        if (seen.has(key)) return "skip" as MappableKey;
        seen.add(key);
        return key;
      });

      setColumnMap(deduped);
      setStep("map");
    };

    reader.onerror = () => {
      setFileError("Failed to read file.");
    };

    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  /* ---- Column mapping ---- */

  function updateMapping(colIndex: number, field: MappableKey) {
    setColumnMap((prev) => {
      const next = [...prev];
      next[colIndex] = field;
      return next;
    });
  }

  /* ---- Build mapped rows for preview / import ---- */

  function buildMappedRows(): Record<string, string>[] {
    return csvRows.map((row) => {
      const mapped: Record<string, string> = {};
      columnMap.forEach((field, colIndex) => {
        if (field !== "skip" && colIndex < row.length) {
          mapped[field] = row[colIndex].trim();
        }
      });
      return mapped;
    });
  }

  /* ---- Preview data ---- */

  const previewRows = step === "preview" ? buildMappedRows().slice(0, 5) : [];
  const activeMappings = columnMap
    .map((field, i) => ({ field, header: csvHeaders[i], index: i }))
    .filter((m) => m.field !== "skip");
  const mappedFieldKeys = activeMappings.map((m) => m.field);

  /* ---- Import ---- */

  const handleImport = useCallback(async () => {
    const allRows = buildMappedRows();
    if (allRows.length === 0) return;

    setImporting(true);
    setProgress({ done: 0, total: allRows.length, errors: 0 });
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      try {
        const brand = row.brand || "OIO";
        const initiative = row.initiative || "";
        const variation = row.variation || "V1";
        const angle = row.angle || "";
        const source = row.source || "";
        const product = row.product || "OIO";
        const contentType = row.contentType || "IMG";
        const creativeType = row.creativeType || "ESTATIC";
        const dimensions = row.dimensions || "1:1";
        const copySlug = row.copySlug || "";
        const filename = row.filename || "";
        const date = row.date || (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        })();

        const conceptKey = [
          brand, initiative, variation, angle, source,
          product, contentType, creativeType, copySlug, date,
        ].join("__");

        await createMut.mutateAsync({
          brand,
          initiative,
          variation,
          angle,
          source,
          product,
          contentType,
          creativeType,
          dimensions,
          copySlug,
          filename,
          date,
          adSetId: row.adSetId || "",
          adSetName: row.adSetName || "",
          destinationUrl: row.destinationUrl || undefined,
          headline: row.headline || "",
          bodyCopy: row.bodyCopy || "",
          handle: row.handle || null,
          cta: row.cta || null,
          displayUrl: row.displayUrl || null,
          agency: null,
          fileUrl: row.fileUrl || null,
          conceptKey,
        });

        successCount++;
      } catch {
        errorCount++;
      }

      setProgress({ done: i + 1, total: allRows.length, errors: errorCount });
    }

    setImporting(false);
    setProgress(null);
    setImportResult({ success: successCount, errors: errorCount });
    utils.queue.list.invalidate();

    if (errorCount === 0) {
      onImport();
      onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvRows, columnMap, createMut, utils, onImport, onClose]);

  /* ---- Step indicator ---- */

  const steps: { key: Step; label: string; number: number }[] = [
    { key: "upload", label: "Upload", number: 1 },
    { key: "map", label: "Map Columns", number: 2 },
    { key: "preview", label: "Preview & Import", number: 3 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  function renderStepIndicator() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "12px 20px", borderBottom: "1px solid var(--surface-3)", flexShrink: 0, background: "var(--surface-0)" }}>
        {steps.map((s, i) => {
          const isActive = s.key === step;
          const isCompleted = i < currentStepIndex;
          return (
            <React.Fragment key={s.key}>
              {i > 0 && (
                <div style={{ width: "32px", height: "1px", background: isCompleted ? "#0099C6" : "var(--surface-3)" }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 600,
                    background: isCompleted ? "#0099C6" : isActive ? "rgba(0,153,198,0.15)" : "var(--surface-2)",
                    color: isCompleted ? "white" : isActive ? "#0099C6" : "var(--text-muted)",
                    border: isActive ? "1px solid #0099C6" : "1px solid transparent",
                  }}
                >
                  {isCompleted ? <Check size={12} /> : s.number}
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
        <div style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-muted)" }}>
          {csvRows.length > 0 && `${csvRows.length} row${csvRows.length !== 1 ? "s" : ""}`}
        </div>
      </div>
    );
  }

  /* ---- Step 1: Upload ---- */

  function renderUploadStep() {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px" }}>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "100%",
            maxWidth: "480px",
            padding: "48px 32px",
            border: `2px dashed ${dragOver ? "#0099C6" : "var(--surface-3)"}`,
            borderRadius: "10px",
            background: dragOver ? "rgba(0,153,198,0.06)" : "var(--surface-0)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(0,153,198,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {dragOver ? (
              <Upload size={22} style={{ color: "#0099C6" }} />
            ) : (
              <FileSpreadsheet size={22} style={{ color: "#60A7C8" }} />
            )}
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Drop your CSV here
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "6px 0 0" }}>
              or click to browse files
            </p>
          </div>
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              fontFamily: "'IBM Plex Mono', monospace",
              background: "var(--surface-2)",
              padding: "3px 10px",
              borderRadius: "4px",
            }}
          >
            .csv
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        {fileError && (
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "#f85149",
              fontSize: "12px",
            }}
          >
            <AlertCircle size={14} />
            {fileError}
          </div>
        )}
      </div>
    );
  }

  /* ---- Step 2: Map Columns ---- */

  function renderMapStep() {
    const mappedCount = columnMap.filter((k) => k !== "skip").length;
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
        <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
            Map each CSV column to a target field, or skip columns you don't need.
          </p>
          <span style={{ fontSize: "11px", color: "#0099C6", fontWeight: 600 }}>
            {mappedCount} mapped
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {csvHeaders.map((header, colIndex) => {
            const currentField = columnMap[colIndex] || "skip";
            const sampleValues = csvRows
              .slice(0, 3)
              .map((row) => row[colIndex]?.trim() || "")
              .filter(Boolean);

            return (
              <div
                key={colIndex}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "8px 12px",
                  background: currentField !== "skip" ? "rgba(0,153,198,0.04)" : "var(--surface-0)",
                  border: `1px solid ${currentField !== "skip" ? "rgba(0,153,198,0.15)" : "var(--surface-2)"}`,
                  borderRadius: "6px",
                }}
              >
                {/* CSV column name */}
                <div style={{ flex: "0 0 180px", minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={header}
                  >
                    {header}
                  </span>
                  {sampleValues.length > 0 && (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        display: "block",
                        marginTop: "2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={sampleValues.join(", ")}
                    >
                      e.g. {sampleValues.join(", ")}
                    </span>
                  )}
                </div>

                {/* Arrow */}
                <span style={{ color: "var(--text-muted)", fontSize: "12px", flexShrink: 0 }}>
                  {"\u2192"}
                </span>

                {/* Target field dropdown */}
                <div style={{ position: "relative", flex: "0 0 200px" }}>
                  <select
                    value={currentField}
                    onChange={(e) => updateMapping(colIndex, e.target.value as MappableKey)}
                    style={{
                      width: "100%",
                      appearance: "none",
                      fontSize: "12px",
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      color: currentField !== "skip" ? "var(--text-primary)" : "var(--text-muted)",
                      background: "var(--surface-1)",
                      border: "1px solid var(--surface-3)",
                      borderRadius: "4px",
                      padding: "6px 28px 6px 10px",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    {MAPPABLE_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--text-muted)",
                    }}
                  />
                </div>

                {/* Status indicator */}
                <div style={{ flexShrink: 0 }}>
                  {currentField !== "skip" ? (
                    <Check size={14} style={{ color: "#0099C6" }} />
                  ) : (
                    <span style={{ width: "14px", height: "14px", display: "inline-block" }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---- Step 3: Preview & Import ---- */

  function renderPreviewStep() {
    const allRows = buildMappedRows();
    const totalRows = allRows.length;

    return (
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Progress bar */}
        {importing && progress && (
          <div style={{ flexShrink: 0, height: "3px", background: "var(--surface-3)", position: "relative" }}>
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

        {/* Import result banner */}
        {importResult && (
          <div
            style={{
              flexShrink: 0,
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: importResult.errors > 0 ? "rgba(248,81,73,0.08)" : "rgba(46,160,67,0.08)",
              borderBottom: "1px solid var(--surface-3)",
            }}
          >
            {importResult.errors > 0 ? (
              <AlertCircle size={14} style={{ color: "#f85149" }} />
            ) : (
              <Check size={14} style={{ color: "#2ea043" }} />
            )}
            <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
              {importResult.success} imported successfully
              {importResult.errors > 0 && `, ${importResult.errors} failed`}
            </span>
            {importResult.errors > 0 && (
              <button
                onClick={() => {
                  onImport();
                  onClose();
                }}
                style={{ ...btnSecondary, marginLeft: "auto", padding: "4px 12px", fontSize: "11px" }}
              >
                Close
              </button>
            )}
          </div>
        )}

        {/* Summary */}
        <div style={{ flexShrink: 0, padding: "12px 20px", borderBottom: "1px solid var(--surface-3)", display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{totalRows}</strong> rows will be imported with{" "}
            <strong style={{ color: "var(--text-primary)" }}>{mappedFieldKeys.length}</strong> mapped fields
          </span>
          {totalRows > 5 && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
              Showing first 5 rows
            </span>
          )}
        </div>

        {/* Preview table */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--surface-2)" }}>
              <tr>
                <th
                  style={{
                    ...labelStyle,
                    padding: "8px 12px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    borderBottom: "1px solid var(--surface-3)",
                    width: "40px",
                  }}
                >
                  #
                </th>
                {activeMappings.map((m) => {
                  const fieldDef = MAPPABLE_FIELDS.find((f) => f.key === m.field);
                  return (
                    <th
                      key={m.index}
                      style={{
                        ...labelStyle,
                        padding: "8px 12px",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid var(--surface-3)",
                      }}
                    >
                      {fieldDef?.label || m.field}
                    </th>
                  );
                })}
                <th
                  style={{
                    ...labelStyle,
                    padding: "8px 12px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    borderBottom: "1px solid var(--surface-3)",
                  }}
                >
                  Generated Ad Name
                </th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => {
                const brand = row.brand || "OIO";
                const initiative = row.initiative || "";
                const variation = row.variation || "V1";
                const angle = row.angle || "";
                const source = row.source || "";
                const product = row.product || "OIO";
                const contentType = row.contentType || "IMG";
                const creativeType = row.creativeType || "ESTATIC";
                const dimensions = row.dimensions || "1:1";
                const copySlug = row.copySlug || "";
                const filename = row.filename || "";
                const date = row.date || "";

                let adName = "";
                try {
                  adName = generateAdName({
                    handle: row.handle || "korruscircadian",
                    brand,
                    initiative,
                    variation,
                    angle,
                    source,
                    product,
                    contentType,
                    creativeType,
                    dimensions,
                    copySlug,
                    filename,
                    date,
                  });
                } catch {
                  adName = "(error)";
                }

                return (
                  <tr
                    key={rowIndex}
                    style={{ borderBottom: "1px solid var(--surface-2)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "";
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 12px",
                        color: "var(--text-muted)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: "10px",
                      }}
                    >
                      {rowIndex + 1}
                    </td>
                    {activeMappings.map((m) => (
                      <td
                        key={m.index}
                        style={{
                          padding: "6px 12px",
                          color: row[m.field] ? "var(--text-primary)" : "var(--text-muted)",
                          fontSize: "11px",
                          maxWidth: "180px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={row[m.field] || ""}
                      >
                        {row[m.field] || (
                          <span style={{ fontStyle: "italic", opacity: 0.5 }}>{"\u2014"}</span>
                        )}
                      </td>
                    ))}
                    <td
                      style={{
                        padding: "6px 12px",
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: "10px",
                        color: "var(--text-secondary)",
                        maxWidth: "280px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={adName}
                    >
                      {adName}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ---- Render ---- */

  const canProceedToPreview = columnMap.some((k) => k !== "skip");

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div style={dialogStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FileSpreadsheet size={16} style={{ color: "#0099C6" }} />
            <span style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
              Import from CSV
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            style={{
              color: "var(--text-secondary)",
              background: "transparent",
              border: "none",
              cursor: importing ? "not-allowed" : "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        {renderStepIndicator()}

        {/* Step content */}
        {step === "upload" && renderUploadStep()}
        {step === "map" && renderMapStep()}
        {step === "preview" && renderPreviewStep()}

        {/* Footer */}
        <div style={footerStyle}>
          {importing && progress && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginRight: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "12px",
                  height: "12px",
                  border: "2px solid var(--surface-3)",
                  borderTopColor: "#0099C6",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
              Importing {progress.done} / {progress.total}
              {progress.errors > 0 && ` (${progress.errors} errors)`}
            </span>
          )}

          {step === "upload" && (
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancel
            </button>
          )}

          {step === "map" && (
            <>
              <button type="button" onClick={() => setStep("upload")} style={btnSecondary}>
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("preview")}
                disabled={!canProceedToPreview}
                style={{
                  ...btnPrimary,
                  opacity: canProceedToPreview ? 1 : 0.5,
                  cursor: canProceedToPreview ? "pointer" : "not-allowed",
                }}
                onMouseEnter={(e) => {
                  if (canProceedToPreview) (e.currentTarget as HTMLButtonElement).style.background = "#007a9e";
                }}
                onMouseLeave={(e) => {
                  if (canProceedToPreview) (e.currentTarget as HTMLButtonElement).style.background = "#0099C6";
                }}
              >
                Preview
                <ChevronDown size={12} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </>
          )}

          {step === "preview" && !importResult && (
            <>
              <button
                type="button"
                onClick={() => setStep("map")}
                disabled={importing}
                style={btnSecondary}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || csvRows.length === 0}
                style={{
                  ...btnPrimary,
                  background: importing ? "#007a9e" : "#0099C6",
                  opacity: importing || csvRows.length === 0 ? 0.7 : 1,
                  cursor: importing || csvRows.length === 0 ? "not-allowed" : "pointer",
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
                    <span
                      style={{
                        display: "inline-block",
                        width: "13px",
                        height: "13px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "white",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={13} />
                    Import {csvRows.length} row{csvRows.length !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </>
          )}

          {step === "preview" && importResult && (
            <button
              type="button"
              onClick={() => {
                onImport();
                onClose();
              }}
              style={btnPrimary}
            >
              <Check size={13} />
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
