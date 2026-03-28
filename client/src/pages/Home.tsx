import React, { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";
import { useFieldOptions } from "../hooks/useFieldOptions";
import { InlineText } from "../components/InlineEditCell";
import {
  generateAdName,
  parseFilenameToFields,
  validateUploadRow,
  AdNameFields,
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
  List,
  Loader2,
  Pencil,
} from "lucide-react";
import { X } from "lucide-react";

const STATUS_TABS = ["all", "draft", "ready", "uploading", "uploaded", "error"] as const;

const ALL_DIMS = ["9:16", "4:5", "1:1", "16:9"] as const;

// Today's date in MMDDYY format
function getTodayMMDDYY(): string {
  const today = new Date();
  return `${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}${String(today.getFullYear()).slice(-2)}`;
}

// Dimension badge style
function dimBadgeClass(dim: string, status?: string): string {
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

export default function Home() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AdNameFields> & { adSetId?: string; adSetName?: string; headline?: string; bodyCopy?: string }>({});
  const [addSizeOpen, setAddSizeOpen] = useState<string | null>(null);

  // Feature 5: sending state + stub payloads
  const [sendingIds, setSendingIds] = useState<Set<number>>(new Set());
  const [stubPayloads, setStubPayloads] = useState<Record<number, any>>({});

  const { data: rawItems = [] } = trpc.queue.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const items = rawItems as QueueItem[];

  const { data: counts = {} } = trpc.queue.counts.useQuery();
  const { grouped: fieldOpts } = useFieldOptions();
  const { data: angles = [] } = trpc.angles.list.useQuery({});
  const { data: copyEntries = [] } = trpc.copy.list.useQuery({});

  const updateMut = trpc.queue.update.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      utils.queue.counts.invalidate();
    },
  });
  const deleteMut = trpc.queue.delete.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      utils.queue.counts.invalidate();
    },
  });
  const bulkDeleteMut = trpc.queue.bulkDelete.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      utils.queue.counts.invalidate();
      setSelectedKeys(new Set());
    },
  });
  const bulkStatusMut = trpc.queue.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      utils.queue.counts.invalidate();
      setSelectedKeys(new Set());
    },
  });
  const addSizeMut = trpc.queue.addSize.useMutation({
    onSuccess: () => {
      utils.queue.list.invalidate();
      utils.queue.counts.invalidate();
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

  // All row IDs in the current view (for select-all)
  const allIds = useMemo(() => items.map((i) => i.id), [items]);
  const allKeys = useMemo(() => grouped.map((g) => g.key), [grouped]);

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
      utils.queue.counts.invalidate();
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

  const statusColors: Record<string, string> = {
    draft: "bg-[#21262d] text-[#8b949e] border border-[#30363d]",
    ready: "bg-green-500/10 text-green-400 border border-green-500/15",
    uploading: "bg-blue-400/10 text-blue-300 border border-blue-400/15",
    uploaded: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15",
    error: "bg-red-500/10 text-red-400 border border-red-500/15",
  };

  // Start editing a concept group
  function startEdit(key: string) {
    const group = grouped.find((g) => g.key === key);
    if (!group) return;
    const s = group.shared;
    setEditDraft({
      brand: s.brand, initiative: s.initiative, variation: s.variation,
      angle: s.angle, source: s.source, product: s.product,
      contentType: s.contentType, creativeType: s.creativeType,
      copySlug: s.copySlug, filename: s.filename, date: s.date,
      adSetId: s.adSetId ?? "", adSetName: s.adSetName ?? "",
      headline: s.headline ?? "", bodyCopy: s.bodyCopy ?? "",
    });
    setEditingKey(key);
    // auto-expand too
    setExpandedKeys((prev) => new Set(prev).add(key));
  }

  async function saveEdit(conceptKey: string) {
    const group = grouped.find((g) => g.key === conceptKey);
    if (!group) return;
    for (const row of group.rows) {
      const merged = { ...row, ...editDraft };
      const newConceptKey = [
        merged.brand, merged.initiative, merged.variation, merged.angle,
        merged.source, merged.product, merged.contentType, merged.creativeType,
        merged.copySlug, merged.filename, merged.date,
      ].join("__");
      await updateMut.mutateAsync({
        id: row.id,
        brand: editDraft.brand,
        initiative: editDraft.initiative,
        variation: editDraft.variation,
        angle: editDraft.angle,
        source: editDraft.source,
        product: editDraft.product,
        contentType: editDraft.contentType,
        creativeType: editDraft.creativeType,
        copySlug: editDraft.copySlug,
        filename: editDraft.filename,
        date: editDraft.date,
        adSetId: editDraft.adSetId ?? null,
        adSetName: editDraft.adSetName ?? null,
        headline: editDraft.headline ?? null,
        bodyCopy: editDraft.bodyCopy ?? null,
        conceptKey: newConceptKey,
      });
    }
    setEditingKey(null);
    setEditDraft({});
  }

  // Live preview in edit mode
  const editPreview = editingKey
    ? generateAdName({
        brand: editDraft.brand ?? "",
        initiative: editDraft.initiative ?? "",
        variation: editDraft.variation ?? "",
        angle: editDraft.angle ?? "",
        source: editDraft.source ?? "",
        product: editDraft.product ?? "",
        contentType: editDraft.contentType ?? "",
        creativeType: editDraft.creativeType ?? "",
        dimensions: "…",
        copySlug: editDraft.copySlug ?? "",
        filename: editDraft.filename ?? "",
        date: editDraft.date ?? "",
      })
    : "";

  // Compute selected IDs for bulk operations
  const selectedIds = useMemo(() => {
    const ids: number[] = [];
    for (const key of selectedKeys) {
      const group = grouped.find((g) => g.key === key);
      if (group) ids.push(...group.rows.map((r) => r.id));
    }
    return ids;
  }, [selectedKeys, grouped]);

  const COL_COUNT = 16;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 py-3 flex items-center justify-between"
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
            Prepare and send ads to Meta Ads Manager
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Feature 4: Batch Import button */}
          <button
            onClick={() => setShowBatchDialog(true)}
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
            <List className="w-3.5 h-3.5" /> Batch Import
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold tracking-wide rounded-md transition-colors"
            style={{ background: "#0099C6" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Ad
          </button>
        </div>
      </div>

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

      {/* Bulk actions bar */}
      {selectedKeys.size > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2 bg-[#0099C6]/10 border-b border-[#0099C6]/20">
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{selectedKeys.size} concept{selectedKeys.size !== 1 ? "s" : ""} selected ({selectedIds.length} ads)</span>
          <div className="w-px h-4" style={{ background: "var(--surface-3)" }} />
          <button
            onClick={() => bulkStatusMut.mutate({ ids: selectedIds, status: "ready" })}
            className="px-2.5 py-1 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-md hover:bg-green-500/20"
          >
            ✓ Mark Ready
          </button>
          <button
            onClick={() => bulkDeleteMut.mutate({ ids: selectedIds })}
            className="px-2.5 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/20"
          >
            Delete All
          </button>
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

      {/* Table */}
      <div className="flex-1 overflow-auto">
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
                {(["Status","Concept Name","Brand","Initiative","Var.","Angle","Source","Product","Format","Type","Copy","Filename","Date","Sizes","Actions"] as const).map((label) => (
                  <th
                    key={label}
                    className={`px-3 py-2 text-left whitespace-nowrap uppercase font-semibold${label === "Concept Name" ? " min-w-[200px]" : label === "Initiative" ? " min-w-[120px]" : label === "Angle" ? " min-w-[110px]" : label === "Type" ? " min-w-[90px]" : label === "Filename" ? " min-w-[100px]" : label === "Sizes" ? " min-w-[100px]" : ""}`}
                    style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--text-muted)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => {
                const { key, rows, shared } = group;
                const isExpanded = expandedKeys.has(key);
                const isEditing = editingKey === key;
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

                return (
                  <React.Fragment key={key}>
                    {/* Main concept row */}
                    <tr
                      className={isEditing ? "border-l-2 border-[#0099C6]" : ""}
                      style={{
                        background: isEditing
                          ? "var(--surface-1)"
                          : selectedKeys.has(key)
                          ? "rgba(0,153,198,0.06)"
                          : undefined,
                        borderBottom: "1px solid var(--surface-2)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isEditing && !selectedKeys.has(key)) {
                          (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.03)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isEditing && !selectedKeys.has(key)) {
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
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-sm ${statusColors[gStatus]}`}>
                          {gStatus}
                        </span>
                        {hasErrors && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-sm bg-red-500/10 text-red-400 border border-red-500/15">!</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 max-w-[200px]">
                        <span
                          className="font-mono text-[10px] truncate block"
                          title={shared.generatedAdName}
                          style={{ color: conceptLabel ? "#60A7C8" : "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {conceptLabel || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>incomplete</span>}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-primary)", fontSize: "12px" }}>{shared.brand || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-primary)", fontSize: "12px" }}>{shared.initiative || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-primary)", fontSize: "12px" }}>{shared.variation || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{shared.angle || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{shared.source || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{shared.product || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{shared.contentType || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{shared.creativeType || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{shared.copySlug || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-secondary)", fontSize: "11px" }}>{shared.filename || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-3 py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-secondary)", fontSize: "11px" }}>{shared.date || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
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
                      {/* Actions */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {!isGroupLocked && (
                            <button
                              onClick={() => { if (isEditing) { setEditingKey(null); setEditDraft({}); } else { startEdit(key); } }}
                              className={`p-1 transition-colors ${isEditing ? "text-[#0099C6]" : "text-zinc-500 hover:text-zinc-200"}`}
                              title={isEditing ? "Cancel Edit" : "Edit"}
                            >
                              <Pencil className="w-3.5 h-3.5" />
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
                              onClick={() => bulkDeleteMut.mutate({ ids: rows.map((r) => r.id) })}
                              className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                              title="Delete all sizes"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit form row */}
                    {isEditing && (
                      <tr style={{ background: "var(--surface-1)", borderLeft: "2px solid #0099C6" }}>
                        <td colSpan={COL_COUNT + 1} className="px-6 py-4">
                          <div className="space-y-3">
                            {/* Ad name preview */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Preview:</span>
                              <code
                                className="text-[10px] px-2 py-1 rounded break-all"
                                style={{
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  color: "#60A7C8",
                                  background: "var(--surface-0)",
                                  border: "1px solid rgba(48,54,61,0.5)",
                                }}
                              >
                                {editPreview}
                              </code>
                            </div>
                            {/* 6-col field grid */}
                            <div className="grid grid-cols-6 gap-2">
                              {(["brand", "initiative", "variation", "angle", "source", "product", "contentType", "creativeType", "copySlug", "filename", "date"] as const).map((field) => {
                                const isSelect = ["angle", "source", "product", "contentType", "creativeType", "copySlug"].includes(field);
                                const optMap: Record<string, { value: string; label: string }[]> = {
                                  angle: angleOptions,
                                  source: sourceOpts,
                                  product: productOpts,
                                  contentType: contentTypeOpts,
                                  creativeType: creativeTypeOpts,
                                  copySlug: copyOptions,
                                };
                                const label = {
                                  brand: "Brand", initiative: "Initiative", variation: "Variation",
                                  angle: "Angle", source: "Source", product: "Product",
                                  contentType: "Format", creativeType: "Type",
                                  copySlug: "Copy Slug", filename: "Filename", date: "Date",
                                }[field];
                                const inputStyle = {
                                  background: "var(--surface-0)",
                                  border: "1px solid var(--surface-3)",
                                  color: "var(--text-primary)",
                                  fontSize: "11px",
                                };
                                return (
                                  <div key={field}>
                                    <label
                                      className="block text-[9px] mb-1 uppercase font-semibold"
                                      style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
                                    >
                                      {label}
                                    </label>
                                    {isSelect ? (
                                      <select
                                        value={(editDraft as any)[field] ?? ""}
                                        onChange={(e) => setEditDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                                        className="w-full rounded px-2 py-1 focus:outline-none"
                                        style={{ ...inputStyle, focusBorderColor: "rgba(0,153,198,0.6)" } as React.CSSProperties}
                                        onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                                        onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}
                                      >
                                        <option value="">—</option>
                                        {(optMap[field] || []).map((o) => (
                                          <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        value={(editDraft as any)[field] ?? ""}
                                        onChange={(e) => setEditDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                                        className="w-full rounded px-2 py-1 focus:outline-none"
                                        style={inputStyle}
                                        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                                        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Extra fields */}
                            <div className="grid grid-cols-4 gap-2">
                              {(["adSetId", "adSetName", "headline", "bodyCopy"] as const).map((field) => (
                                <div key={field}>
                                  <label
                                    className="block text-[9px] mb-1 uppercase font-semibold"
                                    style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
                                  >
                                    {field === "adSetId" ? "Ad Set ID" : field === "adSetName" ? "Ad Set Name" : field === "headline" ? "Headline" : "Body Copy"}
                                  </label>
                                  <input
                                    type="text"
                                    value={(editDraft as any)[field] ?? ""}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                                    className="w-full rounded px-2 py-1 focus:outline-none text-[11px]"
                                    style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                                    onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                                    onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => saveEdit(key)}
                                disabled={updateMut.isPending}
                                className="px-3 py-1.5 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                                style={{ background: "#0099C6" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
                              >
                                {updateMut.isPending ? "Saving…" : `Save (${rows.length} size${rows.length !== 1 ? "s" : ""})`}
                              </button>
                              <button
                                onClick={() => { setEditingKey(null); setEditDraft({}); }}
                                className="px-3 py-1.5 text-xs transition-colors"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Expanded sizes section */}
                    {isExpanded && !isEditing && (
                      <tr style={{ background: "var(--surface-0)" }}>
                        <td
                          colSpan={COL_COUNT + 1}
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
                                    {["Dims","Ad Name","File","Status","Actions"].map((h) => (
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
                                          <span
                                            className="truncate block"
                                            title={sizeRow.generatedAdName}
                                            style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-secondary)" }}
                                          >
                                            {sizeRow.generatedAdName || "—"}
                                          </span>
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
                                                onClick={() => deleteMut.mutate({ id: sizeRow.id })}
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
              {grouped.length === 0 && (
                <tr>
                  <td colSpan={COL_COUNT + 1} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="text-[10px] font-mono px-3 py-2 rounded-sm select-none"
                        style={{ color: "var(--text-muted)", background: "var(--surface-1)", border: "1px solid var(--surface-3)", letterSpacing: "0.02em", fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        KORRUS_OIO_V1__{"{angle}"}__UGC__{"{dims}"}__{"{copy}"}__032826
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Queue is empty</p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                          Click <span style={{ color: "#0099C6" }}>+ Add Ad</span> or use Batch Import to get started
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

      {/* Feature 4: Batch Import Dialog */}
      {showBatchDialog && (
        <BatchImportDialog onClose={() => setShowBatchDialog(false)} />
      )}

      {/* Close add-size popovers on outside click */}
      {addSizeOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setAddSizeOpen(null)} />
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
      utils.queue.counts.invalidate();
      onClose();
    },
  });

  const [form, setForm] = useState({
    brand: "KORRUS",
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
  });

  const [parseInput, setParseInput] = useState("");
  // Feature 3: parsed indicator state
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
      // Feature 3: auto-fill date if not parsed
      if (!parsedFields.date) {
        updated.date = getTodayMMDDYY();
      }
      return updated;
    });
    // Show parsed indicator briefly
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

        {/* Feature 3: Auto-parse on paste */}
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

        {/* Extra fields */}
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Headline" value={form.headline} onChange={(v) => setForm({ ...form, headline: v })} />
          <FormInput label="Body Copy" value={form.bodyCopy} onChange={(v) => setForm({ ...form, bodyCopy: v })} />
          <FormInput label="File URL" value={form.fileUrl} onChange={(v) => setForm({ ...form, fileUrl: v })} />
          <FormInput label="Ad Set ID" value={form.adSetId} onChange={(v) => setForm({ ...form, adSetId: v })} />
        </div>
        <FormInput label="Ad Set Name" value={form.adSetName} onChange={(v) => setForm({ ...form, adSetName: v })} />

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

// Feature 4: Batch Import Dialog
function BatchImportDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [rawInput, setRawInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const createMut = trpc.queue.create.useMutation();

  const today = getTodayMMDDYY();

  const lines = useMemo(() => {
    return rawInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }, [rawInput]);

  const previews = useMemo(() => {
    return lines.map((line) => {
      const fields = parseFilenameToFields(line);
      return { line, fields };
    });
  }, [lines]);

  async function handleImport() {
    if (lines.length === 0) return;
    setIsCreating(true);
    try {
      for (const { fields } of previews) {
        const conceptKey = [
          fields.brand ?? "", fields.initiative ?? "", fields.variation ?? "",
          fields.angle ?? "", fields.source ?? "", fields.product ?? "",
          fields.contentType ?? "", fields.creativeType ?? "",
          fields.copySlug ?? "", fields.filename ?? "", fields.date ?? today,
        ].join("__");
        await createMut.mutateAsync({
          brand: fields.brand ?? "",
          initiative: fields.initiative ?? "",
          variation: fields.variation ?? "",
          angle: fields.angle ?? "",
          source: fields.source ?? "",
          product: fields.product ?? "",
          contentType: fields.contentType ?? "",
          creativeType: fields.creativeType ?? "",
          dimensions: fields.dimensions ?? "",
          copySlug: fields.copySlug ?? "",
          filename: fields.filename ?? "",
          date: fields.date ?? today,
          fileUrl: (fields as any).fileUrl ?? "",
          adSetId: "",
          adSetName: "",
          headline: "",
          bodyCopy: "",
          conceptKey,
        });
      }
      utils.queue.list.invalidate();
      utils.queue.counts.invalidate();
      onClose();
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="w-full max-w-3xl space-y-4 my-auto p-6 rounded-lg"
        style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}
      >
        <div className="flex items-center justify-between">
          <h3
            className="font-semibold"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}
          >
            Batch Import
          </h3>
          <button type="button" onClick={onClose} style={{ color: "var(--text-secondary)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-[11px] mb-1.5" style={{ color: "var(--text-secondary)" }}>Paste URLs or filenames, one per line</label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={"https://cdn.example.com/KRS-0007-Holiday_V1A_ugc_9x16_032826.mp4\nKORRUS_OIO_V2B_studio_feed_042526.jpg"}
            rows={6}
            className="w-full px-3 py-2.5 text-sm focus:outline-none resize-none rounded-sm"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              background: "var(--surface-0)",
              border: "1px solid var(--surface-3)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
            onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--surface-3)"; }}
          />
        </div>

        {/* Live preview table */}
        {previews.length > 0 && (
          <div className="overflow-hidden rounded-sm" style={{ border: "1px solid var(--surface-3)" }}>
            <div className="px-3 py-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--surface-3)" }}>
              <span
                className="text-[10px] font-semibold uppercase"
                style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
              >
                Preview — {previews.length} line{previews.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead className="sticky top-0" style={{ background: "var(--surface-2)" }}>
                  <tr>
                    {["Filename","Brand","Product","Format","Dims","Source","Var.","Date"].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-1.5 text-left font-semibold uppercase whitespace-nowrap"
                        style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--text-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previews.map(({ fields }, i) => (
                    <tr
                      key={i}
                      style={{ borderTop: "1px solid var(--surface-2)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.03)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                    >
                      <td
                        className="px-2 py-1.5 max-w-[200px] truncate"
                        title={fields.filename}
                        style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-primary)" }}
                      >
                        {fields.filename || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>}
                      </td>
                      <td className="px-2 py-1.5" style={{ color: "var(--text-primary)" }}>{fields.brand || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-2 py-1.5" style={{ color: "var(--text-primary)" }}>{fields.product || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-2 py-1.5" style={{ color: "var(--text-primary)" }}>{fields.contentType || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-2 py-1.5" style={{ color: "var(--text-primary)" }}>{fields.dimensions || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-2 py-1.5" style={{ color: "var(--text-primary)" }}>{fields.source || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="px-2 py-1.5" style={{ color: "var(--text-primary)" }}>{fields.variation || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td
                        className="px-2 py-1.5"
                        style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-primary)" }}
                      >
                        {fields.date || <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>{today}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={lines.length === 0 || isCreating}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ background: "#0099C6" }}
            onMouseEnter={(e) => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Importing…
              </>
            ) : (
              <>Import {lines.length > 0 ? `${lines.length} ad${lines.length !== 1 ? "s" : ""}` : "ads"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const inputStyle = {
    background: "var(--surface-0)",
    border: "1px solid var(--surface-3)",
    color: "var(--text-primary)",
  };
  return (
    <div>
      <label
        className="block text-[10px] mb-1 uppercase font-semibold"
        style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-sm px-2.5 py-1.5 text-sm focus:outline-none"
        style={inputStyle}
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
  const inputStyle = {
    background: "var(--surface-0)",
    border: "1px solid var(--surface-3)",
    color: "var(--text-primary)",
  };
  return (
    <div>
      <label
        className="block text-[10px] mb-1 uppercase font-semibold"
        style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm px-2.5 py-1.5 text-sm focus:outline-none"
        style={inputStyle}
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
