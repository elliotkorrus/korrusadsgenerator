import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { trpc } from "../lib/trpc";
import { useFieldOptions } from "../hooks/useFieldOptions";
import { InlineText, InlineSelect } from "../components/InlineEditCell";
import BatchDropDialog, { ParsedRow } from "../components/BatchDropDialog";
import MergeDialog from "../components/MergeDialog";
import {
  generateAdName,
  parseFilenameToFields,
  validateUploadRow,
} from "@shared/naming";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Upload,
  CheckCircle2,
  Copy,
  ExternalLink,
  CloudUpload,
  Loader2,
  LayoutGrid,
  LayoutList,
  Download,
  Settings2,
  Search,
  Check,
  GitMerge,
} from "lucide-react";
import { X } from "lucide-react";

const STATUS_TABS = ["all", "draft", "ready", "uploading", "uploaded", "error"] as const;

const ALL_DIMS = ["9:16", "4:5", "1:1", "16:9"] as const;

const BATCH_EDITABLE_FIELDS = [
  { key: "initiative", label: "Initiative" },
  { key: "angle", label: "Angle" },
  { key: "source", label: "Source" },
  { key: "product", label: "Product" },
  { key: "date", label: "Date" },
  { key: "brand", label: "Brand" },
  { key: "variation", label: "Variation" },
  { key: "copySlug", label: "Copy Slug" },
] as const;

// Today's date in MMDDYY format
function getTodayMMDDYY(): string {
  const today = new Date();
  return `${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}${String(today.getFullYear()).slice(-2)}`;
}

// Current YYYY-MM
function getCurrentYearMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

// Dimension badge style
function dimBadgeClass(dim: string, _status?: string): string {
  const base = "rounded-sm px-1.5 py-0.5 text-[9px] font-mono font-bold border inline-flex items-center gap-1";
  const dimStyles: Record<string, string> = {
    "9:16": "bg-violet-500/10 text-violet-300 border-violet-500/15",
    "4:5": "bg-sky-500/10 text-sky-300 border-sky-500/15",
    "1:1": "bg-teal-500/10 text-teal-300 border-teal-500/15",
    "16:9": "bg-amber-500/10 text-amber-300 border-amber-500/15",
  };
  return `${base} ${dimStyles[dim] || "bg-zinc-500/10 text-zinc-300 border-zinc-500/15"}`;
}

// Compute "worst" status for a group
function groupStatus(statuses: string[]): string {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("uploading")) return "uploading";
  if (statuses.every((s) => s === "uploaded")) return "uploaded";
  if (statuses.includes("ready")) return "ready";
  return "draft";
}

type QueueItem = {
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
  adSetId: string | null;
  adSetName: string | null;
  destinationUrl: string | null;
  headline: string | null;
  bodyCopy: string | null;
  handle: string | null;
  cta: string | null;
  displayUrl: string | null;
  fileUrl: string | null;
  fileKey: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  status: "draft" | "ready" | "uploading" | "uploaded" | "error";
  metaAdId: string | null;
  metaCreativeId: string | null;
  errorMessage: string | null;
  uploadedAt: string | null;
  conceptKey: string | null;
};

// ── Copy button component ─────────────────────────────────────────
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 transition-colors flex-shrink-0 ${className || ""}`}
      title="Copy to clipboard"
      style={{ color: copied ? "#4ade80" : "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px" }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied && <span style={{ fontSize: "9px", fontFamily: "'IBM Plex Sans', sans-serif" }}>Copied</span>}
    </button>
  );
}

// ── CSV Export ────────────────────────────────────────────────────
function exportCSV(items: QueueItem[]) {
  const headers = [
    "Ad Name", "Brand", "Initiative", "Variation", "Angle", "Source",
    "Product", "Format", "Type", "Dimensions", "Copy", "Filename",
    "Date", "Status", "Handle", "File URL",
  ];
  const escape = (v: string | null | undefined) => {
    const s = (v ?? "").toString().replace(/"/g, '""');
    return `"${s}"`;
  };
  const rows = items.map((i) => [
    i.generatedAdName, i.brand, i.initiative, i.variation, i.angle, i.source,
    i.product, i.contentType, i.creativeType, i.dimensions, i.copySlug, i.filename,
    i.date, i.status, i.handle ?? "", i.fileUrl ?? "",
  ].map(escape).join(","));
  const csv = [headers.map(escape).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `korrus-ads-export-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Status checklist popover ─────────────────────────────────────
function StatusChecklist({ errors }: { errors: string[] }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const ALL_CHECKS = [
    { label: "File attached", key: "File URL" },
    { label: "Initiative", key: "initiative" },
    { label: "Angle", key: "angle" },
    { label: "Source", key: "source" },
    { label: "Product", key: "product" },
    { label: "Brand", key: "brand" },
    { label: "Variation", key: "variation" },
    { label: "Copy slug", key: "copySlug" },
    { label: "Filename", key: "filename" },
    { label: "Date", key: "date" },
    { label: "Dimensions", key: "dimensions" },
    { label: "Format", key: "contentType" },
    { label: "Creative type", key: "creativeType" },
  ];

  const failingLabels = new Set(
    errors.map((e) => e.replace(" is required", "").replace("Invalid ", "").toLowerCase())
  );

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        className="ml-1 inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-sm bg-red-500/10 text-red-400 border border-red-500/15 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="View validation errors"
      >!
      </button>
      {open && (
        <div
          className="absolute left-0 top-6 z-50 rounded-md shadow-2xl p-3 min-w-[200px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--surface-3)", fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          <p className="text-[10px] font-semibold uppercase mb-2" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            Validation
          </p>
          <div className="space-y-1">
            {ALL_CHECKS.map(({ label, key }) => {
              const failing = failingLabels.has(key.toLowerCase()) || errors.some((e) => e.toLowerCase().includes(key.toLowerCase()));
              return (
                <div key={key} className="flex items-center gap-2 text-[11px]" style={{ color: failing ? "#f87171" : "#4ade80" }}>
                  <span className="text-[10px]">{failing ? "✗" : "✓"}</span>
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Card View Component ───────────────────────────────────────────
function ConceptCard({
  group,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onUpdateField,
  onDelete,
  onAddSize,
  addSizeOpen,
  setAddSizeOpen,
  isGroupLocked,
  availableDims,
  gStatus,
  rowErrors,
  hasErrors,
  statusColors,
  angleOptions,
  sourceOpts,
  productOpts,
  contentTypeOpts,
  creativeTypeOpts,
  copyOptions,
}: {
  group: { key: string; rows: QueueItem[]; shared: QueueItem };
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onUpdateField: (field: string, value: string) => void;
  onDelete: () => void;
  onAddSize: (dim: string) => void;
  addSizeOpen: boolean;
  setAddSizeOpen: (v: boolean) => void;
  isGroupLocked: boolean;
  availableDims: readonly string[];
  gStatus: string;
  rowErrors: string[];
  hasErrors: boolean;
  statusColors: Record<string, string>;
  angleOptions: { value: string; label: string }[];
  sourceOpts: { value: string; label: string }[];
  productOpts: { value: string; label: string }[];
  contentTypeOpts: { value: string; label: string }[];
  creativeTypeOpts: { value: string; label: string }[];
  copyOptions: { value: string; label: string }[];
}) {
  const { key, rows, shared } = group;
  const dimColors: Record<string, string> = {
    "9:16": "#8b5cf6",
    "4:5": "#38bdf8",
    "1:1": "#2dd4bf",
    "16:9": "#f59e0b",
  };

  return (
    <div
      className="rounded-lg flex flex-col overflow-hidden transition-all"
      style={{
        border: isSelected ? "1px solid rgba(0,153,198,0.5)" : "1px solid var(--surface-3)",
        background: isSelected ? "rgba(0,153,198,0.04)" : "var(--surface-1)",
      }}
    >
      {/* Thumbnail */}
      <div
        className="relative cursor-pointer"
        style={{ aspectRatio: "16/9", background: "var(--surface-2)", overflow: "hidden" }}
        onClick={onToggleExpand}
      >
        {shared.fileUrl ? (
          <img
            src={shared.fileUrl}
            alt={shared.generatedAdName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: dimColors[shared.dimensions] ? `${dimColors[shared.dimensions]}15` : "var(--surface-2)" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
              {shared.dimensions || "No file"}
            </span>
          </div>
        )}
        {/* Select checkbox overlay */}
        <div className="absolute top-2 left-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="accent-[#0099C6] w-3.5 h-3.5"
          />
        </div>
        {/* Status badge overlay */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm ${statusColors[gStatus]}`}>
            {gStatus}
          </span>
          {hasErrors && <StatusChecklist errors={rowErrors} />}
        </div>
      </div>

      {/* Ad name */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-start gap-1.5">
        <span
          className="text-[11px] flex-1 break-all leading-relaxed"
          title={shared.generatedAdName}
          style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#60A7C8" }}
        >
          {shared.generatedAdName || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>incomplete</span>}
        </span>
        {shared.generatedAdName && <CopyButton text={shared.generatedAdName} />}
      </div>

      {/* Pills */}
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {[shared.initiative, shared.angle, shared.source, shared.date].filter(Boolean).map((pill, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 rounded-sm text-[10px]"
            style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--surface-3)" }}
          >
            {pill}
          </span>
        ))}
      </div>

      {/* Size badges */}
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {rows.map((r) => (
          <span key={r.id} className={dimBadgeClass(r.dimensions, r.status)}>
            {r.dimensions}
            {r.status === "uploaded" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            {r.status === "error" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
            {r.status === "ready" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />}
          </span>
        ))}
      </div>

      {/* Actions row */}
      <div
        className="px-3 py-2 flex items-center gap-1 mt-auto"
        style={{ borderTop: "1px solid var(--surface-3)" }}
      >
        <button
          onClick={onToggleExpand}
          className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-sm transition-colors"
          style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--surface-3)" }}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {isExpanded ? "Collapse" : "Edit"}
        </button>
        {!isGroupLocked && availableDims.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setAddSizeOpen(!addSizeOpen)}
              className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-sm transition-colors"
              style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--surface-3)" }}
            >
              <Plus className="w-3 h-3" /> Size
            </button>
            {addSizeOpen && (
              <div
                className="absolute left-0 top-7 z-20 rounded-sm shadow-xl p-1.5 min-w-[100px]"
                style={{ background: "var(--surface-2)", border: "1px solid var(--surface-3)" }}
              >
                {availableDims.map((dim) => (
                  <button
                    key={dim}
                    onClick={() => { onAddSize(dim); setAddSizeOpen(false); }}
                    className="block w-full text-left px-2 py-1 text-xs rounded-sm transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                  >
                    <span className={dimBadgeClass(dim)}>{dim}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!isGroupLocked && (
          <button
            onClick={onDelete}
            className="ml-auto p-1 text-zinc-600 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded inline edit */}
      {isExpanded && (
        <div
          className="px-3 pb-3 pt-1 space-y-2"
          style={{ borderTop: "1px solid var(--surface-3)", background: "var(--surface-0)" }}
        >
          <p className="text-[10px] uppercase font-semibold mt-1" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Edit Fields</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {[
              { label: "Brand", el: <InlineText value={shared.brand || ""} onSave={(v) => onUpdateField("brand", v)} disabled={isGroupLocked} placeholder="OIO" /> },
              { label: "Initiative", el: <InlineText value={shared.initiative || ""} onSave={(v) => onUpdateField("initiative", v)} disabled={isGroupLocked} placeholder="s_001" /> },
              { label: "Variation", el: <InlineText value={shared.variation || ""} onSave={(v) => onUpdateField("variation", v)} disabled={isGroupLocked} placeholder="v1" /> },
              { label: "Angle", el: angleOptions.length > 0 ? <InlineSelect value={shared.angle || ""} options={angleOptions} onSave={(v) => onUpdateField("angle", v)} disabled={isGroupLocked} /> : <InlineText value={shared.angle || ""} onSave={(v) => onUpdateField("angle", v)} disabled={isGroupLocked} placeholder="angle" /> },
              { label: "Source", el: <InlineSelect value={shared.source || ""} options={sourceOpts} onSave={(v) => onUpdateField("source", v)} disabled={isGroupLocked} /> },
              { label: "Product", el: <InlineSelect value={shared.product || ""} options={productOpts} onSave={(v) => onUpdateField("product", v)} disabled={isGroupLocked} /> },
              { label: "Format", el: <InlineSelect value={shared.contentType || ""} options={contentTypeOpts} onSave={(v) => onUpdateField("contentType", v)} disabled={isGroupLocked} /> },
              { label: "Type", el: <InlineSelect value={shared.creativeType || ""} options={creativeTypeOpts} onSave={(v) => onUpdateField("creativeType", v)} disabled={isGroupLocked} /> },
              { label: "Copy", el: <InlineSelect value={shared.copySlug || ""} options={copyOptions} onSave={(v) => onUpdateField("copySlug", v)} disabled={isGroupLocked} /> },
              { label: "Filename", el: <InlineText value={shared.filename || ""} onSave={(v) => onUpdateField("filename", v)} disabled={isGroupLocked} mono placeholder="filename" /> },
              { label: "Date", el: <InlineText value={shared.date || ""} onSave={(v) => onUpdateField("date", v)} disabled={isGroupLocked} mono placeholder="2026-03" /> },
              { label: "Handle", el: <InlineText value={shared.handle || ""} onSave={(v) => onUpdateField("handle", v)} disabled={isGroupLocked} placeholder="@creator" /> },
            ].map(({ label, el }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] flex-shrink-0 w-14" style={{ color: "var(--text-muted)" }}>{label}</span>
                {el}
              </div>
            ))}
          </div>
          <p className="text-[10px] uppercase font-semibold mt-2" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Meta Upload</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {[
              { label: "Ad Set ID", el: <InlineText value={shared.adSetId || ""} onSave={(v) => onUpdateField("adSetId", v)} disabled={isGroupLocked} mono placeholder="120..." /> },
              { label: "Ad Set", el: <InlineText value={shared.adSetName || ""} onSave={(v) => onUpdateField("adSetName", v)} disabled={isGroupLocked} placeholder="Ad set name" /> },
              { label: "Dest URL", el: <InlineText value={shared.destinationUrl || ""} onSave={(v) => onUpdateField("destinationUrl", v)} disabled={isGroupLocked} placeholder="https://..." /> },
              { label: "Display", el: <InlineText value={shared.displayUrl || ""} onSave={(v) => onUpdateField("displayUrl", v)} disabled={isGroupLocked} placeholder="korrus.com" /> },
              { label: "CTA", el: <InlineText value={shared.cta || ""} onSave={(v) => onUpdateField("cta", v)} disabled={isGroupLocked} placeholder="SHOP_NOW" /> },
            ].map(({ label, el }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] flex-shrink-0 w-14" style={{ color: "var(--text-muted)" }}>{label}</span>
                {el}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Home component ───────────────────────────────────────────
export default function Home() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addSizeOpen, setAddSizeOpen] = useState<string | null>(null);
  // Drag-and-drop state
  const [dragOver, setDragOver] = useState(false);
  const [batchDropFiles, setBatchDropFiles] = useState<File[] | null>(null);
  const dragCounterRef = useRef(0);

  // Feature 2: view mode
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    try {
      return (localStorage.getItem("korrus-view-mode") as "table" | "card") || "table";
    } catch {
      return "table";
    }
  });

  // Feature 4: search
  const [searchText, setSearchText] = useState("");

  // Feature 5: batch defaults panel
  const [showBatchDefaults, setShowBatchDefaults] = useState(false);
  const [batchDefaults, setBatchDefaults] = useState({
    brand: "OIO",
    initiative: "",
    source: "",
    product: "",
    date: getCurrentYearMonth(),
  });

  // Merge dialog
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<{ ids: number[]; label: string } | null>(null);
  function confirmDelete(ids: number[], label: string) { setPendingDelete({ ids, label }); }
  function executeDelete() {
    if (!pendingDelete) return;
    bulkDeleteMut.mutate({ ids: pendingDelete.ids });
    setPendingDelete(null);
  }

  // Feature 6: batch field edit
  const [showBatchFieldEdit, setShowBatchFieldEdit] = useState(false);
  const [batchEditField, setBatchEditField] = useState<string>(BATCH_EDITABLE_FIELDS[0].key);
  const [batchEditValue, setBatchEditValue] = useState("");

  // Feature 5: sending state + stub payloads
  const [sendingIds, setSendingIds] = useState<Set<number>>(new Set());
  const [stubPayloads, setStubPayloads] = useState<Record<number, any>>({});

  // Always fetch all items for accurate group counts; filter client-side for the active tab
  const { data: rawAllItems = [] } = trpc.queue.list.useQuery({});
  const allItems = rawAllItems as QueueItem[];
  const items = useMemo(
    () => statusFilter === "all" ? allItems : allItems.filter((i) => i.status === statusFilter),
    [allItems, statusFilter]
  );

  // Concept group counts per status (shown in tabs)
  const counts = useMemo(() => {
    const groupMap = new Map<string, string[]>();
    for (const item of allItems) {
      const key = item.conceptKey || item.id.toString();
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(item.status);
    }
    const result: Record<string, number> = { all: groupMap.size };
    for (const statuses of groupMap.values()) {
      const gs = groupStatus(statuses);
      result[gs] = (result[gs] || 0) + 1;
    }
    return result;
  }, [allItems]);
  const { grouped: fieldOpts } = useFieldOptions();
  const { data: angles = [] } = trpc.angles.list.useQuery({});
  const { data: copyEntries = [] } = trpc.copy.list.useQuery({});

  const updateMut = trpc.queue.update.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
    },
  });
  const deleteMut = trpc.queue.delete.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
    },
  });
  const bulkDeleteMut = trpc.queue.bulkDelete.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      setSelectedKeys(new Set());
    },
  });
  const bulkStatusMut = trpc.queue.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      setSelectedKeys(new Set());
    },
  });
  const mergeMut = trpc.queue.merge.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      setSelectedKeys(new Set());
      setShowMergeDialog(false);
    },
  });
  const addSizeMut = trpc.queue.addSize.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
    },
  });

  const angleOptions = useMemo(
    () => angles.filter((a) => a.status === "active").map((a) => ({ value: a.angleSlug, label: a.angleSlug })),
    [angles]
  );
  const copyOptions = useMemo(
    () => copyEntries.filter((c) => c.status === "active").map((c) => ({ value: c.copySlug, label: c.copySlug })),
    [copyEntries]
  );

  const sourceOpts = fieldOpts["source"] || [{ value: "UGC", label: "UGC" }, { value: "Studio", label: "Studio" }, { value: "AI", label: "AI" }, { value: "Stock", label: "Stock" }];
  const productOpts = fieldOpts["product"] || [{ value: "OIO", label: "OIO" }, { value: "SERUM", label: "SERUM" }];
  const contentTypeOpts = fieldOpts["contentType"] || [{ value: "VID", label: "Video" }, { value: "IMG", label: "Image" }, { value: "CAR", label: "Carousel" }, { value: "GIF", label: "GIF" }];
  const creativeTypeOpts = fieldOpts["creativeType"] || [{ value: "ESTATIC", label: "Elevated Static" }];

  // Group items by conceptKey
  const grouped = useMemo(() => {
    const map = new Map<string, QueueItem[]>();
    for (const item of items) {
      const key = item.conceptKey || item.id.toString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([key, rows]) => ({
      key,
      rows: rows.sort((a, b) => a.dimensions.localeCompare(b.dimensions)),
      shared: rows[0],
    }));
  }, [items]);

  // Feature 4: filtered grouped array
  const filteredGrouped = useMemo(() => {
    if (!searchText.trim()) return grouped;
    const q = searchText.toLowerCase();
    return grouped.filter(({ shared, rows }) => {
      const fields = [
        shared.brand, shared.initiative, shared.angle, shared.source,
        shared.product, shared.contentType, shared.creativeType, shared.copySlug,
        shared.filename, shared.date, shared.generatedAdName, shared.handle ?? "",
        ...rows.map((r) => r.dimensions),
      ];
      return fields.some((f) => f?.toLowerCase().includes(q));
    });
  }, [grouped, searchText]);

  // All row IDs in the current view (for select-all)
  const allKeys = useMemo(() => filteredGrouped.map((g) => g.key), [filteredGrouped]);
  const selectedIds = useMemo(() => {
    const ids: number[] = [];
    for (const key of selectedKeys) {
      const group = grouped.find((g) => g.key === key);
      if (group) ids.push(...group.rows.map((r) => r.id));
    }
    return ids;
  }, [selectedKeys, grouped]);

  function isLocked(status: string) {
    return status === "uploading" || status === "uploaded";
  }

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectGroup(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selectedKeys.size === allKeys.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(allKeys));
  }

  // Feature 1: get row validation errors
  function getRowErrors(item: QueueItem): string[] {
    return validateUploadRow({
      brand: item.brand ?? "",
      initiative: item.initiative ?? "",
      variation: item.variation ?? "",
      angle: item.angle ?? "",
      source: item.source ?? "",
      product: item.product ?? "",
      contentType: item.contentType ?? "",
      creativeType: item.creativeType ?? "",
      dimensions: item.dimensions ?? "",
      copySlug: item.copySlug ?? "",
      filename: item.filename ?? "",
      date: item.date ?? "",
      adSetId: item.adSetId,
      fileUrl: item.fileUrl,
      destinationUrl: item.destinationUrl,
    });
  }

  // Feature 5: send to Meta via real API call
  async function sendToMeta(id: number) {
    setSendingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/send-to-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: id }),
      });
      const data = await res.json();
      if (data.stub) {
        setStubPayloads((prev) => ({ ...prev, [id]: data.adPayload }));
      }
    } finally {
      setSendingIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
      utils.queue.list.invalidate();
    }
  }

  // Feature 5: poll every 3 seconds when any item is uploading
  useEffect(() => {
    const hasUploading = items.some((item) => item.status === "uploading");
    if (!hasUploading) return;
    const interval = setInterval(() => {
      utils.queue.list.invalidate();
    }, 3000);
    return () => clearInterval(interval);
  }, [items, utils]);

  // Persist view mode
  useEffect(() => {
    try { localStorage.setItem("korrus-view-mode", viewMode); } catch { /* ignore */ }
  }, [viewMode]);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounterRef.current = 0;
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (droppedFiles.length > 0) {
      setBatchDropFiles(droppedFiles);
    }
  }, []);

  const statusColors: Record<string, string> = {
    draft: "bg-[#21262d] text-[#8b949e] border border-[#30363d]",
    ready: "bg-green-500/10 text-green-400 border border-green-500/15",
    uploading: "bg-blue-400/10 text-blue-300 border border-blue-400/15",
    uploaded: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15",
    error: "bg-red-500/10 text-red-400 border border-red-500/15",
  };

  const updateConceptField = async (conceptKey: string, field: string, value: string) => {
    const group = grouped.find((g) => g.key === conceptKey);
    if (!group) return;
    for (const row of group.rows) {
      await updateMut.mutateAsync({ id: row.id, [field]: value });
    }
  };

  // Feature 5: Apply batch defaults to all drafts
  async function applyBatchDefaults() {
    const draftGroups = filteredGrouped.filter((g) => groupStatus(g.rows.map((r) => r.status)) === "draft");
    for (const g of draftGroups) {
      for (const [field, value] of Object.entries(batchDefaults)) {
        if (value.trim()) {
          await updateConceptField(g.key, field, value);
        }
      }
    }
  }

  // Feature 6: Apply batch field edit to selected concepts
  async function applyBatchFieldEdit() {
    if (!batchEditValue.trim()) return;
    for (const key of selectedKeys) {
      await updateConceptField(key, batchEditField, batchEditValue);
    }
    setShowBatchFieldEdit(false);
    setBatchEditValue("");
  }

  const COL_COUNT = 17;

  // Get select options for currently-selected batch edit field
  const batchEditFieldMeta = BATCH_EDITABLE_FIELDS.find((f) => f.key === batchEditField);
  const batchEditSelectOpts: Record<string, { value: string; label: string }[]> = {
    source: sourceOpts,
    product: productOpts,
    angle: angleOptions,
    copySlug: copyOptions,
  };

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Full-page drag overlay */}
      {dragOver && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              background: "var(--surface-1)",
              border: "2px dashed #0099C6",
              borderRadius: "12px",
              padding: "48px 64px",
            }}
          >
            <CloudUpload size={40} style={{ color: "#0099C6" }} />
            <p
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "'IBM Plex Sans', sans-serif",
                margin: 0,
              }}
            >
              Drop files to import
            </p>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                fontFamily: "'IBM Plex Sans', sans-serif",
                margin: 0,
              }}
            >
              Images and videos accepted
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex-shrink-0 px-5 py-3 flex items-center justify-between gap-3"
        style={{ borderBottom: "1px solid var(--surface-3)", background: "var(--surface-0)" }}
      >
        <div>
          <h2
            className="font-semibold leading-none"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}
          >
            Upload Queue
          </h2>
          <p className="mt-0.5" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Drag &amp; drop files anywhere, or use Add Ad
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {/* Merge button — appears when 2+ concept groups are selected */}
          {selectedKeys.size >= 2 && (
            <button
              onClick={() => setShowMergeDialog(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 transition-all text-[11px] font-semibold rounded-md"
              style={{
                background: "rgba(96,167,200,0.12)",
                border: "1px solid rgba(96,167,200,0.35)",
                color: "#60A7C8",
                cursor: "pointer",
              }}
              title={`Merge ${selectedKeys.size} selected concepts into one`}
            >
              <GitMerge className="w-3.5 h-3.5" />
              Merge {selectedKeys.size}
            </button>
          )}

          {/* Feature 7: CSV Export */}
          <button
            onClick={() => exportCSV(items)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 transition-colors text-[11px] font-medium rounded-md"
            style={{ background: "transparent", border: "1px solid var(--surface-3)", color: "var(--text-secondary)" }}
            title="Export CSV"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,153,198,0.5)";
              (e.currentTarget as HTMLButtonElement).style.color = "#60A7C8";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--surface-3)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
            }}
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>

          {/* Feature 5: Batch defaults toggle */}
          <button
            onClick={() => setShowBatchDefaults((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 transition-colors text-[11px] font-medium rounded-md"
            style={{
              background: showBatchDefaults ? "rgba(0,153,198,0.1)" : "transparent",
              border: `1px solid ${showBatchDefaults ? "rgba(0,153,198,0.4)" : "var(--surface-3)"}`,
              color: showBatchDefaults ? "#60A7C8" : "var(--text-secondary)",
            }}
            title="Set Batch Defaults"
          >
            <Settings2 className="w-3.5 h-3.5" /> Defaults
          </button>

          {/* Feature 2: View toggle */}
          <div
            className="flex items-center rounded-md overflow-hidden"
            style={{ border: "1px solid var(--surface-3)" }}
          >
            <button
              onClick={() => setViewMode("table")}
              className="px-2 py-1.5 transition-colors"
              style={{
                background: viewMode === "table" ? "var(--surface-2)" : "transparent",
                color: viewMode === "table" ? "var(--text-primary)" : "var(--text-muted)",
                border: "none",
                cursor: "pointer",
              }}
              title="Table view"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("card")}
              className="px-2 py-1.5 transition-colors"
              style={{
                background: viewMode === "card" ? "var(--surface-2)" : "transparent",
                color: viewMode === "card" ? "var(--text-primary)" : "var(--text-muted)",
                border: "none",
                cursor: "pointer",
              }}
              title="Card view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 transition-colors text-[11px] font-medium rounded-md"
            style={{ background: "transparent", border: "1px solid var(--surface-3)", color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,153,198,0.5)";
              (e.currentTarget as HTMLButtonElement).style.color = "#60A7C8";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--surface-3)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Ad
          </button>
        </div>
      </div>

      {/* Feature 5: Batch defaults panel */}
      {showBatchDefaults && (
        <div
          className="flex-shrink-0 px-5 py-3 flex items-center gap-3 flex-wrap"
          style={{ borderBottom: "1px solid var(--surface-3)", background: "rgba(0,153,198,0.04)" }}
        >
          <span className="text-[11px] font-semibold" style={{ color: "#60A7C8", minWidth: "fit-content" }}>Batch Defaults</span>
          {[
            { label: "Brand", key: "brand" as const, type: "text" },
            { label: "Initiative", key: "initiative" as const, type: "text" },
            { label: "Date (YYYY-MM)", key: "date" as const, type: "text" },
          ].map(({ label, key }) => (
            <div key={key} className="flex items-center gap-1.5">
              <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</label>
              <input
                type="text"
                value={batchDefaults[key]}
                onChange={(e) => setBatchDefaults((p) => ({ ...p, [key]: e.target.value }))}
                className="px-2 py-1 rounded-sm text-[11px] focus:outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--surface-3)",
                  color: "var(--text-primary)",
                  width: "90px",
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              />
            </div>
          ))}
          {[
            { label: "Source", key: "source" as const, opts: sourceOpts },
            { label: "Product", key: "product" as const, opts: productOpts },
          ].map(({ label, key, opts }) => (
            <div key={key} className="flex items-center gap-1.5">
              <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</label>
              <select
                value={batchDefaults[key]}
                onChange={(e) => setBatchDefaults((p) => ({ ...p, [key]: e.target.value }))}
                className="px-2 py-1 rounded-sm text-[11px] focus:outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--surface-3)",
                  color: "var(--text-primary)",
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                <option value="">—</option>
                {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
          <button
            onClick={applyBatchDefaults}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
            style={{ background: "#0099C6", color: "white", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
          >
            Apply to all drafts
          </button>
          <button
            onClick={() => setBatchDefaults({ brand: "OIO", initiative: "", source: "", product: "", date: getCurrentYearMonth() })}
            className="text-[11px] transition-colors"
            style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            Reset
          </button>
        </div>
      )}

      {/* Status filter tabs */}
      <div
        className="flex-shrink-0 flex items-center gap-0.5 px-5 py-2 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--surface-3)", background: "var(--surface-0)" }}
      >
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className="flex-shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors whitespace-nowrap"
            style={
              statusFilter === tab
                ? { background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--surface-3)" }
                : { color: "var(--text-muted)", border: "1px solid transparent" }
            }
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {(counts as any)[tab] !== undefined && (
              <span
                className="ml-1.5 px-1.5 py-px font-mono"
                style={{ fontSize: "9px", background: "var(--surface-3)", color: "var(--text-secondary)", borderRadius: "3px" }}
              >
                {(counts as any)[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Feature 4: Search bar */}
      <div
        className="flex-shrink-0 px-5 py-2 flex items-center gap-2"
        style={{ borderBottom: "1px solid var(--surface-3)", background: "var(--surface-0)" }}
      >
        <div className="relative flex items-center flex-1 max-w-xs">
          <Search className="absolute left-2.5 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by name, angle, initiative…"
            className="w-full pl-8 pr-7 py-1.5 text-[12px] rounded-md focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--surface-3)",
              color: "var(--text-primary)",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.5)"; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
          />
          {searchText && (
            <button
              className="absolute right-2.5 transition-colors"
              onClick={() => setSearchText("")}
              style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {searchText && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {filteredGrouped.length} result{filteredGrouped.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2 flex-wrap" style={{ background: "rgba(0,153,198,0.1)", borderBottom: "1px solid rgba(0,153,198,0.2)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{selectedKeys.size} concept{selectedKeys.size !== 1 ? "s" : ""} selected ({selectedIds.length} ads)</span>
          <div className="w-px h-4" style={{ background: "var(--surface-3)" }} />
          <button
            onClick={() => bulkStatusMut.mutate({ ids: selectedIds, status: "ready" })}
            className="px-2.5 py-1 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-md hover:bg-green-500/20"
          >
            ✓ Mark Ready
          </button>
          <button
            onClick={() => confirmDelete(selectedIds, `${selectedKeys.size} concept${selectedKeys.size !== 1 ? "s" : ""}`)}
            className="px-2.5 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/20"
          >
            Delete All
          </button>
          {/* Feature 6: Edit Field button when 2+ selected */}
          {selectedKeys.size >= 2 && (
            <div className="relative">
              <button
                onClick={() => setShowBatchFieldEdit((v) => !v)}
                className="px-2.5 py-1 text-xs rounded-md transition-colors"
                style={{
                  background: showBatchFieldEdit ? "rgba(0,153,198,0.2)" : "rgba(0,153,198,0.1)",
                  color: "#60A7C8",
                  border: "1px solid rgba(0,153,198,0.3)",
                }}
              >
                Edit Field
              </button>
              {showBatchFieldEdit && (
                <div
                  className="absolute left-0 top-8 z-50 rounded-md shadow-2xl p-3 min-w-[220px]"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--surface-3)", fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  <p className="text-[10px] font-semibold uppercase mb-2" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                    Bulk Edit Field
                  </p>
                  <select
                    value={batchEditField}
                    onChange={(e) => { setBatchEditField(e.target.value); setBatchEditValue(""); }}
                    className="w-full px-2 py-1.5 text-xs rounded-sm focus:outline-none mb-2"
                    style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                  >
                    {BATCH_EDITABLE_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                  {batchEditSelectOpts[batchEditField] ? (
                    <select
                      value={batchEditValue}
                      onChange={(e) => setBatchEditValue(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded-sm focus:outline-none mb-2"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                    >
                      <option value="">—</option>
                      {batchEditSelectOpts[batchEditField].map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={batchEditValue}
                      onChange={(e) => setBatchEditValue(e.target.value)}
                      placeholder={`New ${batchEditFieldMeta?.label || batchEditField} value…`}
                      className="w-full px-2 py-1.5 text-xs rounded-sm focus:outline-none mb-2"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                    />
                  )}
                  <button
                    onClick={applyBatchFieldEdit}
                    disabled={!batchEditValue.trim()}
                    className="w-full py-1.5 text-xs font-medium rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#0099C6", color: "white", border: "none", cursor: "pointer" }}
                  >
                    Apply to {selectedKeys.size} concepts
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setSelectedKeys(new Set())}
            className="ml-auto text-xs transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {/* Feature 10: Empty state */}
        {filteredGrouped.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-24 px-8 text-center"
            style={{ minHeight: "320px" }}
          >
            <CloudUpload
              className="mb-5"
              style={{ width: "48px", height: "48px", color: "var(--text-muted)", strokeWidth: 1.5 }}
            />
            <h3
              className="font-semibold mb-2"
              style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "16px", color: "var(--text-secondary)", letterSpacing: "-0.01em" }}
            >
              {searchText ? "No results found" : "Drop your files here to get started"}
            </h3>
            <p
              className="mb-6 max-w-md"
              style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.6" }}
            >
              {searchText
                ? `No concepts match "${searchText}". Try a different search term.`
                : "Drag images or videos anywhere on this page — the app will read your filenames and fill in the fields automatically."}
            </p>
            {!searchText && (
              <button
                onClick={() => setShowAddDialog(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                style={{ background: "var(--surface-2)", border: "1px solid var(--surface-3)", color: "var(--text-secondary)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,153,198,0.5)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#60A7C8";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--surface-3)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                }}
              >
                <Plus className="w-4 h-4" /> Add Ad manually
              </button>
            )}
          </div>
        )}

        {/* Feature 2: Card view */}
        {viewMode === "card" && filteredGrouped.length > 0 && (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGrouped.map((group) => {
                const { key, rows } = group;
                const gStatus = groupStatus(rows.map((r) => r.status));
                const rowErrors = getRowErrors(group.shared);
                const hasErrors = rowErrors.length > 0;
                const isGroupLocked = rows.every((r) => isLocked(r.status));
                const existingDims = new Set(rows.map((r) => r.dimensions));
                const availableDims = ALL_DIMS.filter((d) => !existingDims.has(d));

                return (
                  <ConceptCard
                    key={key}
                    group={group}
                    isSelected={selectedKeys.has(key)}
                    isExpanded={expandedKeys.has(key)}
                    onToggleSelect={() => toggleSelectGroup(key)}
                    onToggleExpand={() => toggleExpand(key)}
                    onUpdateField={(field, value) => updateConceptField(key, field, value)}
                    onDelete={() => confirmDelete(rows.map((r) => r.id), shared.generatedAdName || "this concept")}
                    onAddSize={(dim) => addSizeMut.mutate({ conceptKey: key, dimensions: dim })}
                    addSizeOpen={addSizeOpen === key}
                    setAddSizeOpen={(v) => setAddSizeOpen(v ? key : null)}
                    isGroupLocked={isGroupLocked}
                    availableDims={availableDims}
                    gStatus={gStatus}
                    rowErrors={rowErrors}
                    hasErrors={hasErrors}
                    statusColors={statusColors}
                    angleOptions={angleOptions}
                    sourceOpts={sourceOpts}
                    productOpts={productOpts}
                    contentTypeOpts={contentTypeOpts}
                    creativeTypeOpts={creativeTypeOpts}
                    copyOptions={copyOptions}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Table view */}
        {viewMode === "table" && filteredGrouped.length > 0 && (
          <div className="min-w-max" style={{ borderBottom: "1px solid var(--surface-3)" }}>
            <table className="w-full text-xs border-collapse">
              <thead
                className="sticky top-0 z-10"
                style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}
              >
                <tr>
                  <th className="px-3 py-2 w-8 text-left">
                    <input
                      type="checkbox"
                      checked={allKeys.length > 0 && selectedKeys.size === allKeys.length}
                      onChange={toggleAll}
                      className="accent-[#0099C6]"
                    />
                  </th>
                  <th className="px-1 py-2 w-6"></th>
                  {/* Feature 8: thumbnail column */}
                  <th className="px-2 py-2 w-12" style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--text-muted)" }}></th>
                  {(["Status", "Concept Name", "Brand", "Initiative", "Var.", "Angle", "Source", "Product", "Format", "Type", "Copy", "Filename", "Date", "Sizes", "Handle", "Actions"] as const).map((label) => (
                    <th
                      key={label}
                      className={`px-3 py-2 text-left whitespace-nowrap uppercase font-semibold${label === "Concept Name" ? " min-w-[220px]" : label === "Initiative" ? " min-w-[120px]" : label === "Angle" ? " min-w-[110px]" : label === "Type" ? " min-w-[90px]" : label === "Filename" ? " min-w-[100px]" : label === "Sizes" ? " min-w-[100px]" : ""}`}
                      style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--text-muted)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredGrouped.map((group) => {
                  const { key, rows, shared } = group;
                  const isExpanded = expandedKeys.has(key);
                  const gStatus = groupStatus(rows.map((r) => r.status));
                  const rowErrors = getRowErrors(shared);
                  const hasErrors = rowErrors.length > 0;
                  const isGroupLocked = rows.every((r) => isLocked(r.status));
                  const existingDims = new Set(rows.map((r) => r.dimensions));
                  const availableDims = ALL_DIMS.filter((d) => !existingDims.has(d));

                  // Concept name: ad name without dimensions segment
                  const conceptLabel = shared.generatedAdName
                    ? shared.generatedAdName.replace(/__(9x16|4x5|1x1|16x9)__/, "__…__")
                    : "";

                  // Thumbnail color fallback
                  const dimColors: Record<string, string> = {
                    "9:16": "#8b5cf6",
                    "4:5": "#38bdf8",
                    "1:1": "#2dd4bf",
                    "16:9": "#f59e0b",
                  };

                  return (
                    <React.Fragment key={key}>
                      {/* Main concept row */}
                      <tr
                        style={{
                          background: selectedKeys.has(key)
                            ? "rgba(0,153,198,0.06)"
                            : undefined,
                          borderBottom: "1px solid var(--surface-2)",
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedKeys.has(key)) {
                            (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.03)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selectedKeys.has(key)) {
                            (e.currentTarget as HTMLTableRowElement).style.background = "";
                          }
                        }}
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleSelectGroup(key)}
                            className="accent-[#0099C6]"
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <button onClick={() => toggleExpand(key)} className="transition-colors" style={{ color: "var(--text-muted)" }}>
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        </td>
                        {/* Feature 8: thumbnail with hover preview */}
                        <td className="px-2 py-1.5 w-12">
                          <div className="relative group" style={{ width: "40px" }}>
                            <div
                              style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "3px",
                                overflow: "hidden",
                                flexShrink: 0,
                                background: shared.fileUrl
                                  ? "var(--surface-3)"
                                  : (dimColors[shared.dimensions] ? `${dimColors[shared.dimensions]}20` : "var(--surface-3)"),
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: shared.fileUrl ? "zoom-in" : "default",
                              }}
                            >
                              {shared.fileUrl ? (
                                <img
                                  src={shared.fileUrl}
                                  alt={shared.filename}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <span
                                  style={{
                                    fontSize: "8px",
                                    color: dimColors[shared.dimensions] || "var(--text-muted)",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontWeight: 700,
                                  }}
                                >
                                  {shared.dimensions?.replace(":", "×") || "—"}
                                </span>
                              )}
                            </div>
                            {/* Hover preview popover */}
                            {shared.fileUrl && (
                              <div
                                className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
                                           opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                                style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))" }}
                              >
                                <div
                                  style={{
                                    background: "var(--surface-1)",
                                    border: "1px solid var(--surface-3)",
                                    borderRadius: "6px",
                                    overflow: "hidden",
                                    width: "200px",
                                  }}
                                >
                                  <img
                                    src={shared.fileUrl}
                                    alt={shared.filename}
                                    style={{ width: "100%", height: "auto", display: "block", maxHeight: "240px", objectFit: "contain" }}
                                  />
                                  <div
                                    className="px-2 py-1.5"
                                    style={{ borderTop: "1px solid var(--surface-3)" }}
                                  >
                                    <p className="text-[10px] truncate" style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                                      {shared.filename || "—"}
                                    </p>
                                    <div className="flex gap-1 mt-0.5 flex-wrap">
                                      {rows.map((r) => (
                                        <span key={r.id} className={dimBadgeClass(r.dimensions)}>
                                          {r.dimensions}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                {/* Arrow */}
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: "-5px",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    width: "10px",
                                    height: "10px",
                                    background: "var(--surface-1)",
                                    borderRight: "1px solid var(--surface-3)",
                                    borderBottom: "1px solid var(--surface-3)",
                                    rotate: "45deg",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm ${statusColors[gStatus]}`}>
                            {gStatus}
                          </span>
                          {/* Feature 9: status checklist popover */}
                          {hasErrors && <StatusChecklist errors={rowErrors} />}
                        </td>
                        {/* Feature 3: ad name with copy button */}
                        <td className="px-3 py-1.5 max-w-[220px]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono text-[10px] truncate block flex-1 min-w-0"
                              title={shared.generatedAdName}
                              style={{ color: conceptLabel ? "#60A7C8" : "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
                            >
                              {conceptLabel || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>incomplete</span>}
                            </span>
                            {shared.generatedAdName && (
                              <CopyButton text={shared.generatedAdName} />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineText value={shared.brand || ""} onSave={(v) => updateConceptField(key, "brand", v)} disabled={isGroupLocked} placeholder="OIO" /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineText value={shared.initiative || ""} onSave={(v) => updateConceptField(key, "initiative", v)} disabled={isGroupLocked} placeholder="s_001" /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineText value={shared.variation || ""} onSave={(v) => updateConceptField(key, "variation", v)} disabled={isGroupLocked} placeholder="v1" /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{angleOptions.length > 0 ? <InlineSelect value={shared.angle || ""} options={angleOptions} onSave={(v) => updateConceptField(key, "angle", v)} disabled={isGroupLocked} /> : <InlineText value={shared.angle || ""} onSave={(v) => updateConceptField(key, "angle", v)} disabled={isGroupLocked} placeholder="angle" />}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineSelect value={shared.source || ""} options={sourceOpts} onSave={(v) => updateConceptField(key, "source", v)} disabled={isGroupLocked} /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineSelect value={shared.product || ""} options={productOpts} onSave={(v) => updateConceptField(key, "product", v)} disabled={isGroupLocked} /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineSelect value={shared.contentType || ""} options={contentTypeOpts} onSave={(v) => updateConceptField(key, "contentType", v)} disabled={isGroupLocked} /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineSelect value={shared.creativeType || ""} options={creativeTypeOpts} onSave={(v) => updateConceptField(key, "creativeType", v)} disabled={isGroupLocked} /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineSelect value={shared.copySlug || ""} options={copyOptions} onSave={(v) => updateConceptField(key, "copySlug", v)} disabled={isGroupLocked} /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineText value={shared.filename || ""} onSave={(v) => updateConceptField(key, "filename", v)} disabled={isGroupLocked} mono placeholder="filename" /></td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><InlineText value={shared.date || ""} onSave={(v) => updateConceptField(key, "date", v)} disabled={isGroupLocked} mono placeholder="2026-03" /></td>
                        {/* Sizes badges */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {rows.map((r) => (
                              <span key={r.id} className={dimBadgeClass(r.dimensions, r.status)}>
                                {r.dimensions}
                                {r.status === "uploaded" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
                                {r.status === "error" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
                                {r.status === "ready" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />}
                              </span>
                            ))}
                          </div>
                        </td>
                        {/* Handle */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <InlineText value={shared.handle || ""} onSave={(v) => updateConceptField(key, "handle", v)} disabled={isGroupLocked} placeholder="@creator" />
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {/* Mark Ready */}
                            {gStatus === "draft" && (
                              <button
                                onClick={() => bulkStatusMut.mutate({ ids: rows.map((r) => r.id), status: "ready" })}
                                className="p-1 transition-colors rounded-sm"
                                title="Mark Ready"
                                style={{ color: "#4ade80" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(74,222,128,0.1)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Add Size */}
                            {!isGroupLocked && availableDims.length > 0 && (
                              <div className="relative">
                                <button
                                  onClick={() => setAddSizeOpen(addSizeOpen === key ? null : key)}
                                  className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                                  title="Add Size"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                {addSizeOpen === key && (
                                  <div
                                    className="absolute right-0 top-6 z-20 rounded-sm shadow-xl p-1.5 min-w-[100px]"
                                    style={{ background: "var(--surface-2)", border: "1px solid var(--surface-3)" }}
                                  >
                                    <p
                                      className="text-[9px] uppercase mb-1.5 px-1 font-semibold"
                                      style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
                                    >
                                      Add size
                                    </p>
                                    {availableDims.map((dim) => (
                                      <button
                                        key={dim}
                                        onClick={() => {
                                          addSizeMut.mutate({ conceptKey: key, dimensions: dim });
                                          setAddSizeOpen(null);
                                        }}
                                        className="block w-full text-left px-2 py-1 text-xs rounded-sm transition-colors"
                                        style={{ color: "var(--text-secondary)" }}
                                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
                                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                                      >
                                        <span className={dimBadgeClass(dim)}>{dim}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Delete all */}
                            {!isGroupLocked && (
                              <button
                                onClick={() => confirmDelete(rows.map((r) => r.id), shared.generatedAdName || "this concept")}
                                className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                                title="Delete all sizes"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded sizes section */}
                      {isExpanded && (
                        <tr style={{ background: "var(--surface-0)" }}>
                          <td
                            colSpan={COL_COUNT + 2}
                            className="px-6 py-4"
                            style={{ borderLeft: "2px solid rgba(0,153,198,0.2)" }}
                          >
                            <div className="space-y-3">
                              {/* Validation errors on shared fields */}
                              {hasErrors && (
                                <div
                                  className="pl-3 pr-3 py-2.5 rounded-sm"
                                  style={{ borderLeft: "2px solid rgba(248,81,73,0.6)", background: "rgba(248,81,73,0.05)" }}
                                >
                                  <p
                                    className="text-[10px] font-semibold uppercase mb-1.5"
                                    style={{ letterSpacing: "0.08em", color: "rgba(248,81,73,0.9)" }}
                                  >
                                    Missing or invalid fields
                                  </p>
                                  <ul className="space-y-0.5">
                                    {rowErrors.map((err) => (
                                      <li key={err} className="text-[11px] flex items-center gap-1.5" style={{ color: "rgba(255,130,120,0.9)" }}>
                                        <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                                        {err}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Generated name */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Generated Name (first size):</span>
                                <code
                                  className="text-[11px] select-all break-all px-2.5 py-1 rounded"
                                  style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#60A7C8", background: "var(--surface-2)" }}
                                >
                                  {shared.generatedAdName || "—"}
                                </code>
                                <button
                                  onClick={() => navigator.clipboard.writeText(shared.generatedAdName)}
                                  className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                                  title="Copy to clipboard"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Sizes mini-table */}
                              <div className="overflow-hidden rounded-sm" style={{ border: "1px solid var(--surface-3)" }}>
                                <table className="w-full text-[10px] border-collapse">
                                  <thead style={{ background: "var(--surface-2)" }}>
                                    <tr>
                                      {["Dims", "Ad Name", "File", "Status", "Actions"].map((h) => (
                                        <th
                                          key={h}
                                          className="px-3 py-1.5 text-left font-semibold uppercase"
                                          style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--text-muted)" }}
                                        >
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((sizeRow) => {
                                      const isSending = sendingIds.has(sizeRow.id);
                                      const sizeLocked = isLocked(sizeRow.status);
                                      return (
                                        <tr
                                          key={sizeRow.id}
                                          style={{ borderTop: "1px solid var(--surface-2)" }}
                                          onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.03)"; }}
                                          onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                                        >
                                          <td className="px-3 py-1.5">
                                            <span className={dimBadgeClass(sizeRow.dimensions, sizeRow.status)}>
                                              {sizeRow.dimensions}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 max-w-[280px]">
                                            <div className="flex items-center gap-1.5">
                                              <span
                                                className="truncate block flex-1 min-w-0"
                                                title={sizeRow.generatedAdName}
                                                style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-secondary)" }}
                                              >
                                                {sizeRow.generatedAdName || "—"}
                                              </span>
                                              {sizeRow.generatedAdName && (
                                                <CopyButton text={sizeRow.generatedAdName} />
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            {sizeRow.fileUrl ? (
                                              <a href={sizeRow.fileUrl} target="_blank" rel="noreferrer" className="text-[#0099C6] hover:text-[#60A7C8] flex items-center gap-1">
                                                View <ExternalLink className="w-3 h-3" />
                                              </a>
                                            ) : (
                                              <InlineText
                                                value=""
                                                onSave={(url) => updateMut.mutate({ id: sizeRow.id, fileUrl: url })}
                                                placeholder="Paste file URL…"
                                              />
                                            )}
                                          </td>
                                          <td className="px-3 py-1.5">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm ${statusColors[sizeRow.status]}`}>
                                              {sizeRow.status}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            <div className="flex items-center gap-1">
                                              {sizeRow.status === "draft" && (
                                                getRowErrors(sizeRow).length > 0 ? (
                                                  <button disabled className="px-2 py-1 text-[10px] font-medium rounded bg-green-500/10 text-green-400 border border-green-500/20 cursor-not-allowed opacity-40">
                                                    Ready
                                                  </button>
                                                ) : (
                                                  <button
                                                    onClick={() => updateMut.mutate({ id: sizeRow.id, status: "ready" })}
                                                    className="px-2 py-1 text-[10px] font-medium rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                                                  >
                                                    Ready
                                                  </button>
                                                )
                                              )}
                                              {sizeRow.status === "ready" && (
                                                <button
                                                  onClick={() => sendToMeta(sizeRow.id)}
                                                  disabled={isSending}
                                                  className="px-2 py-1 text-[10px] font-medium rounded bg-[#0099C6]/10 text-[#60A7C8] border border-[#0099C6]/20 hover:bg-[#0099C6]/20 flex items-center gap-1 disabled:opacity-50"
                                                >
                                                  {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                                  {isSending ? "Sending…" : "Send"}
                                                </button>
                                              )}
                                              {!sizeLocked && (
                                                <button
                                                  onClick={() => confirmDelete([sizeRow.id], `${sizeRow.dimensions} size`)}
                                                  className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                                                  title="Delete this size"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Add size button at bottom of expanded section */}
                              {availableDims.length > 0 && !isGroupLocked && (
                                <div className="relative inline-block">
                                  <button
                                    onClick={() => setAddSizeOpen(addSizeOpen === `${key}-expanded` ? null : `${key}-expanded`)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium rounded-sm transition-colors"
                                    style={{ background: "var(--surface-2)", color: "var(--text-secondary)", border: "1px solid var(--surface-3)" }}
                                  >
                                    <Plus className="w-3 h-3" /> Add Size
                                  </button>
                                  {addSizeOpen === `${key}-expanded` && (
                                    <div
                                      className="absolute left-0 top-8 z-20 rounded-sm shadow-xl p-1.5 min-w-[100px]"
                                      style={{ background: "var(--surface-2)", border: "1px solid var(--surface-3)" }}
                                    >
                                      {availableDims.map((dim) => (
                                        <button
                                          key={dim}
                                          onClick={() => {
                                            addSizeMut.mutate({ conceptKey: key, dimensions: dim });
                                            setAddSizeOpen(null);
                                          }}
                                          className="block w-full text-left px-2 py-1 text-xs rounded-sm transition-colors"
                                          style={{ color: "var(--text-secondary)" }}
                                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)"; }}
                                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                                        >
                                          <span className={dimBadgeClass(dim)}>{dim}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* MANUS stub payloads */}
                              {rows.map((sizeRow) => stubPayloads[sizeRow.id] && (
                                <div key={sizeRow.id} className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                                      {sizeRow.dimensions} — MANUS not connected yet — ad payload ready:
                                    </p>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(JSON.stringify(stubPayloads[sizeRow.id], null, 2))}
                                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30"
                                    >
                                      <Copy className="w-3 h-3" /> Copy
                                    </button>
                                  </div>
                                  <pre className="text-[10px] font-mono text-blue-200 bg-zinc-900 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                                    {JSON.stringify(stubPayloads[sizeRow.id], null, 2)}
                                  </pre>
                                </div>
                              ))}

                              {/* Uploading + uploaded + error status blocks */}
                              {rows.filter((r) => r.status === "uploading" && !stubPayloads[r.id]).map((r) => (
                                <div key={r.id} className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-2">
                                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                                  <span className="text-[11px] text-blue-300">{r.dimensions} — Sending to MANUS…</span>
                                </div>
                              ))}
                              {rows.filter((r) => r.status === "uploaded" && r.metaAdId).map((r) => (
                                <div key={r.id} className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                                  <span className="text-[11px] text-green-300">
                                    {r.dimensions} — Uploaded — Meta Ad ID:{" "}
                                    <a href={`https://business.facebook.com/adsmanager/manage/ads?act=${r.metaAdId}`} target="_blank" rel="noreferrer" className="underline hover:text-green-200">
                                      {r.metaAdId}
                                    </a>
                                  </span>
                                </div>
                              ))}
                              {rows.filter((r) => r.status === "error" && r.errorMessage).map((r) => (
                                <div key={r.id} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
                                  <X className="w-3.5 h-3.5 text-red-400" />
                                  <span className="text-[11px] text-red-300">{r.dimensions} — {r.errorMessage}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddDialog && (
        <AddAdDialog
          onClose={() => setShowAddDialog(false)}
          angleOptions={angleOptions}
          copyOptions={copyOptions}
          sourceOpts={sourceOpts}
          productOpts={productOpts}
          contentTypeOpts={contentTypeOpts}
          creativeTypeOpts={creativeTypeOpts}
          dimsOpts={[
            { value: "9:16", label: "9:16" },
            { value: "4:5", label: "4:5" },
            { value: "1:1", label: "1:1" },
            { value: "16:9", label: "16:9" },
          ]}
          copyEntries={copyEntries}
        />
      )}

      {/* Batch Drop Dialog — triggered by file drag-and-drop */}
      {batchDropFiles && (
        <BatchDropDialog
          files={batchDropFiles}
          onImport={async (_rows: ParsedRow[]) => {
            // onImport handled internally; just close
          }}
          onClose={() => setBatchDropFiles(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-xl p-6 w-full max-w-sm space-y-4" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <div>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Delete {pendingDelete.label}?</h3>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>This can't be undone.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} className="px-4 py-2 text-[12px] rounded-md" style={{ background: "transparent", border: "1px solid var(--surface-3)", color: "var(--text-secondary)", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={executeDelete} className="px-4 py-2 text-[12px] font-semibold rounded-md text-white" style={{ background: "#c0392b", border: "none", cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Dialog */}
      {showMergeDialog && selectedKeys.size >= 2 && (
        <MergeDialog
          groups={grouped.filter((g) => selectedKeys.has(g.key))}
          onConfirm={(primaryConceptKey, secondaryConceptKeys) => {
            mergeMut.mutate({ primaryConceptKey, secondaryConceptKeys });
          }}
          onClose={() => setShowMergeDialog(false)}
          isLoading={mergeMut.isPending}
        />
      )}

      {/* Close add-size popovers on outside click */}
      {addSizeOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setAddSizeOpen(null)} />
      )}
      {/* Close batch field edit popover on outside click */}
      {showBatchFieldEdit && (
        <div className="fixed inset-0 z-40" onClick={() => setShowBatchFieldEdit(false)} />
      )}
    </div>
  );
}

function AddAdDialog({
  onClose,
  angleOptions,
  copyOptions,
  sourceOpts,
  productOpts,
  contentTypeOpts,
  creativeTypeOpts,
  dimsOpts,
  copyEntries,
}: {
  onClose: () => void;
  angleOptions: { value: string; label: string }[];
  copyOptions: { value: string; label: string }[];
  sourceOpts: { value: string; label: string }[];
  productOpts: { value: string; label: string }[];
  contentTypeOpts: { value: string; label: string }[];
  creativeTypeOpts: { value: string; label: string }[];
  dimsOpts: { value: string; label: string }[];
  copyEntries: any[];
}) {
  const utils = trpc.useUtils();
  const createMut = trpc.queue.create.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      onClose();
    },
  });

  const { data: metaDefaults } = trpc.meta.get.useQuery();
  const { data: adSets } = trpc.meta.getAdSets.useQuery();

  const [form, setForm] = useState({
    brand: "OIO",
    initiative: "",
    variation: "V1",
    angle: "",
    source: "Studio",
    product: "OIO",
    contentType: "IMG",
    creativeType: "ESTATIC",
    dimensions: "1:1",
    copySlug: "",
    filename: "",
    date: getTodayMMDDYY(),
    adSetId: "",
    adSetName: "",
    headline: "",
    bodyCopy: "",
    fileUrl: "",
    destinationUrl: "",
    displayUrl: "",
    cta: "SHOP_NOW",
    handle: "",
  });

  // Auto-populate from meta settings defaults once loaded
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (metaDefaults && !defaultsApplied) {
      setForm((prev) => ({
        ...prev,
        destinationUrl: metaDefaults.defaultDestinationUrl || prev.destinationUrl,
        displayUrl: metaDefaults.defaultDisplayUrl || prev.displayUrl,
        cta: metaDefaults.defaultCta || prev.cta,
        handle: metaDefaults.instagramHandle || prev.handle,
      }));
      setDefaultsApplied(true);
    }
  }, [metaDefaults, defaultsApplied]);

  const [parseInput, setParseInput] = useState("");
  const [parsed, setParsed] = useState(false);
  const parsedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleParse(value: string) {
    if (!value.trim()) return;
    const parsedFields = parseFilenameToFields(value);
    setForm((prev) => {
      const updated = {
        ...prev,
        ...Object.fromEntries(Object.entries(parsedFields).filter(([, v]) => v)),
      };
      if (!parsedFields.date) {
        updated.date = getTodayMMDDYY();
      }
      return updated;
    });
    setParsed(true);
    if (parsedTimerRef.current) clearTimeout(parsedTimerRef.current);
    parsedTimerRef.current = setTimeout(() => setParsed(false), 2000);
  }

  function handleCopyChange(slug: string) {
    const entry = copyEntries.find((c) => c.copySlug === slug);
    setForm((prev) => ({
      ...prev,
      copySlug: slug,
      headline: entry?.headline || prev.headline,
      bodyCopy: entry?.bodyCopy || prev.bodyCopy,
    }));
  }

  const preview = generateAdName(form);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8" style={{ background: "rgba(0,0,0,0.7)" }}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl space-y-4 my-auto p-6 rounded-lg"
        style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}
      >
        <div className="flex items-center justify-between">
          <h3
            className="font-semibold"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}
          >
            Add Ad
          </h3>
          <button type="button" onClick={onClose} style={{ color: "var(--text-secondary)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Auto-parse on paste */}
        <div className="rounded-sm p-3" style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)" }}>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px]" style={{ color: "var(--text-secondary)" }}>Paste a link or filename to auto-parse fields</label>
            {parsed && (
              <span className="text-[10px] font-medium text-green-400 flex items-center gap-1">
                ✓ Parsed
              </span>
            )}
          </div>
          <input
            type="text"
            value={parseInput}
            onChange={(e) => {
              setParseInput(e.target.value);
              handleParse(e.target.value);
            }}
            placeholder="https://example.com/KRS-0007-Campaign_V1A_9x16.mp4"
            className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--surface-3)",
              color: "var(--text-primary)",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          />
        </div>

        {/* Preview */}
        <div className="rounded-sm p-3" style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)" }}>
          <span className="text-[10px] uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Preview:</span>
          <code
            className="block mt-1 break-all"
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#60A7C8" }}
          >
            {preview}
          </code>
        </div>

        {/* Fields grid */}
        <div className="grid grid-cols-3 gap-3">
          <FormInput label="Brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} />
          <FormInput label="Initiative" value={form.initiative} onChange={(v) => setForm({ ...form, initiative: v })} />
          <FormInput label="Variation" value={form.variation} onChange={(v) => setForm({ ...form, variation: v })} />
          <FormSelect label="Angle" value={form.angle} options={angleOptions} onChange={(v) => setForm({ ...form, angle: v })} />
          <FormSelect label="Source" value={form.source} options={sourceOpts} onChange={(v) => setForm({ ...form, source: v })} />
          <FormSelect label="Product" value={form.product} options={productOpts} onChange={(v) => setForm({ ...form, product: v })} />
          <FormSelect label="Format" value={form.contentType} options={contentTypeOpts} onChange={(v) => setForm({ ...form, contentType: v })} />
          <FormSelect label="Type" value={form.creativeType} options={creativeTypeOpts} onChange={(v) => setForm({ ...form, creativeType: v })} />
          <FormSelect label="Dimensions" value={form.dimensions} options={dimsOpts} onChange={(v) => setForm({ ...form, dimensions: v })} />
          <FormSelect
            label="Copy Slug"
            value={form.copySlug}
            options={copyOptions}
            onChange={handleCopyChange}
          />
          <FormInput label="Filename" value={form.filename} onChange={(v) => setForm({ ...form, filename: v })} />
          <FormInput label="Date (MMDDYY)" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </div>

        {/* Copy & Headline */}
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Headline" value={form.headline} onChange={(v) => setForm({ ...form, headline: v })} placeholder="Auto-filled from Copy Slug" />
          <FormInput label="Body Copy" value={form.bodyCopy} onChange={(v) => setForm({ ...form, bodyCopy: v })} placeholder="Auto-filled from Copy Slug" />
        </div>

        {/* Meta Upload Settings */}
        <div className="rounded-sm p-3 space-y-3" style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)" }}>
          <span className="text-[10px] uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Meta Upload Settings</span>
          <div className="grid grid-cols-2 gap-3">
            {adSets && adSets.length > 0 ? (
              <FormSelect
                label="Ad Set"
                value={form.adSetId}
                options={adSets.map((s: any) => ({ value: s.id, label: `${s.name} (${s.status})` }))}
                onChange={(v) => {
                  const match = adSets.find((s: any) => s.id === v);
                  setForm({ ...form, adSetId: v, adSetName: match?.name || "" });
                }}
              />
            ) : (
              <FormInput label="Ad Set ID" value={form.adSetId} onChange={(v) => setForm({ ...form, adSetId: v })} placeholder="120241241729400419" />
            )}
            <FormInput label="Ad Set Name" value={form.adSetName} onChange={(v) => setForm({ ...form, adSetName: v })} />
            <FormInput label="Destination URL" value={form.destinationUrl} onChange={(v) => setForm({ ...form, destinationUrl: v })} placeholder="https://www.korrus.com/collections/store" />
            <FormInput label="Display Link" value={form.displayUrl} onChange={(v) => setForm({ ...form, displayUrl: v })} placeholder="korrus.com" />
            <FormSelect
              label="CTA"
              value={form.cta}
              options={[
                { value: "SHOP_NOW", label: "Shop Now" },
                { value: "LEARN_MORE", label: "Learn More" },
                { value: "SIGN_UP", label: "Sign Up" },
                { value: "SUBSCRIBE", label: "Subscribe" },
                { value: "GET_OFFER", label: "Get Offer" },
                { value: "CONTACT_US", label: "Contact Us" },
                { value: "DOWNLOAD", label: "Download" },
                { value: "ORDER_NOW", label: "Order Now" },
                { value: "BOOK_NOW", label: "Book Now" },
                { value: "NO_BUTTON", label: "No Button" },
              ]}
              onChange={(v) => setForm({ ...form, cta: v })}
            />
            <FormInput label="Handle" value={form.handle} onChange={(v) => setForm({ ...form, handle: v })} placeholder="korruscircadian" />
          </div>
          <FormInput label="File URL" value={form.fileUrl} onChange={(v) => setForm({ ...form, fileUrl: v })} placeholder="/uploads/..." />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm transition-colors" style={{ color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-white text-sm font-medium rounded-md transition-colors"
            style={{ background: "#0099C6" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
          >
            {createMut.isPending ? "Creating..." : "Create Ad"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 text-xs rounded-sm focus:outline-none"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--surface-3)",
          color: "var(--text-primary)",
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
      />
    </div>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-sm focus:outline-none"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--surface-3)",
          color: "var(--text-primary)",
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
        onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
        onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
