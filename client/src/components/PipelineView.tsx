import { useMemo } from "react";
import {
  FileEdit,
  CheckCircle2,
  Loader2,
  CloudUpload,
  AlertCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Status = "draft" | "ready" | "uploading" | "uploaded" | "error";

interface Row {
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
  agency: string | null;
  fileUrl: string | null;
  fileKey: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  status: Status;
  metaAdId: string | null;
  metaCreativeId: string | null;
  errorMessage: string | null;
  uploadedAt: string | null;
  conceptKey: string | null;
}

interface Group {
  key: string;
  rows: Row[];
  shared: any;
}

interface PipelineViewProps {
  groups: Group[];
  onUpdateStatus: (ids: number[], status: Status) => void;
  onSelect: (key: string) => void;
  selectedKeys: Set<string>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLUMNS: {
  status: Status;
  label: string;
  icon: typeof FileEdit;
  borderColor: string;
  bgColor: string;
  textColor: string;
  dotColor: string;
}[] = [
  {
    status: "draft",
    label: "Draft",
    icon: FileEdit,
    borderColor: "#484f58",
    bgColor: "rgba(72,79,88,0.12)",
    textColor: "#8b949e",
    dotColor: "#484f58",
  },
  {
    status: "ready",
    label: "Ready",
    icon: CheckCircle2,
    borderColor: "#3fb950",
    bgColor: "rgba(63,185,80,0.08)",
    textColor: "#3fb950",
    dotColor: "#58a6ff",
  },
  {
    status: "uploading",
    label: "Uploading",
    icon: Loader2,
    borderColor: "#58a6ff",
    bgColor: "rgba(88,166,255,0.08)",
    textColor: "#58a6ff",
    dotColor: "#58a6ff",
  },
  {
    status: "uploaded",
    label: "Uploaded",
    icon: CloudUpload,
    borderColor: "#2ea043",
    bgColor: "rgba(46,160,67,0.08)",
    textColor: "#2ea043",
    dotColor: "#2ea043",
  },
  {
    status: "error",
    label: "Error",
    icon: AlertCircle,
    borderColor: "#f85149",
    bgColor: "rgba(248,81,73,0.08)",
    textColor: "#f85149",
    dotColor: "#f85149",
  },
];

const DIMENSION_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  "9:16": { label: "9:16", bg: "rgba(139,92,246,0.15)", text: "#a78bfa" },
  "4:5":  { label: "4:5",  bg: "rgba(56,189,248,0.15)", text: "#38bdf8" },
  "1:1":  { label: "1:1",  bg: "rgba(45,212,191,0.15)", text: "#2dd4bf" },
  "16:9": { label: "16:9", bg: "rgba(251,191,36,0.15)", text: "#fbbf24" },
};

const STORY_DIMS = new Set(["9:16"]);
const FEED_DIMS = new Set(["4:5", "1:1", "16:9"]);

const STATUS_DOT_COLORS: Record<Status, string> = {
  draft: "#484f58",
  ready: "#58a6ff",
  uploading: "#58a6ff",
  uploaded: "#3fb950",
  error: "#f85149",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Deterministic hash-based hue from a string. */
function agencyColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `oklch(70% 0.14 ${hue})`;
}

/** Derive a single aggregate status for a group. */
function groupStatus(rows: Row[]): Status {
  if (rows.some((r) => r.status === "error")) return "error";
  if (rows.some((r) => r.status === "uploading")) return "uploading";
  if (rows.every((r) => r.status === "uploaded")) return "uploaded";
  if (rows.some((r) => r.status === "ready")) return "ready";
  return "draft";
}

/** Normalise a dimension string like "1080x1350" into an aspect label. */
function dimensionToAspect(dim: string): string | null {
  const m = dim.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!m) return dim; // pass-through if already "9:16" etc
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  const r = w / h;
  if (Math.abs(r - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(r - 4 / 5) < 0.05) return "4:5";
  if (Math.abs(r - 1) < 0.05) return "1:1";
  if (Math.abs(r - 16 / 9) < 0.05) return "16:9";
  return dim;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Thumbnail({ row }: { row: Row }) {
  const aspect = dimensionToAspect(row.dimensions);
  const gradients: Record<string, string> = {
    "9:16": "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)",
    "4:5":  "linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)",
    "1:1":  "linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)",
    "16:9": "linear-gradient(135deg, #b45309 0%, #fbbf24 100%)",
  };
  const fallback = "linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%)";

  if (row.fileUrl && row.fileMimeType?.startsWith("image/")) {
    return (
      <img
        src={row.fileUrl}
        alt=""
        style={{
          width: 48,
          height: 48,
          objectFit: "cover",
          borderRadius: 4,
          flexShrink: 0,
          background: "var(--surface-2)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 4,
        flexShrink: 0,
        background: (aspect && gradients[aspect]) || fallback,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontFamily: "'IBM Plex Mono', monospace",
        color: "rgba(255,255,255,0.6)",
        userSelect: "none",
      }}
    >
      {aspect || "?"}
    </div>
  );
}

function Pill({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        lineHeight: "16px",
        padding: "1px 6px",
        borderRadius: 3,
        background: "var(--surface-2)",
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
        maxWidth: 120,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {color && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}

function DimensionBadge({ aspect, status }: { aspect: string; status: Status }) {
  const style = DIMENSION_STYLES[aspect] || {
    label: aspect,
    bg: "var(--surface-2)",
    text: "var(--text-secondary)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        lineHeight: "16px",
        padding: "1px 5px",
        borderRadius: 3,
        background: style.bg,
        color: style.text,
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: STATUS_DOT_COLORS[status],
          flexShrink: 0,
        }}
      />
      {style.label}
    </span>
  );
}

function PipelineCard({
  group,
  selected,
  onSelect,
  colStatus,
}: {
  group: Group;
  selected: boolean;
  onSelect: () => void;
  colStatus: Status;
}) {
  const { rows, shared } = group;
  const primaryRow = shared ?? rows[0];

  // Collect unique aspects with per-row status
  const dimensionEntries = rows.map((r) => ({
    aspect: dimensionToAspect(r.dimensions) || r.dimensions,
    status: r.status,
  }));

  const sizeCount = rows.length;
  const errorMsg =
    colStatus === "error"
      ? rows.find((r) => r.status === "error")?.errorMessage ?? null
      : null;
  const metaId =
    colStatus === "uploaded"
      ? rows.find((r) => r.metaAdId)?.metaAdId ?? null
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 10,
        borderRadius: 6,
        background: "var(--surface-1)",
        border: selected
          ? "1px solid #0099C6"
          : "1px solid var(--surface-3)",
        boxShadow: selected ? "0 0 0 1px rgba(0,153,198,0.3)" : "none",
        cursor: "pointer",
        transition: "border-color 150ms, box-shadow 150ms",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "rgba(0,153,198,0.4)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--surface-3)";
        }
      }}
    >
      {/* Agency left accent */}
      {primaryRow.agency && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            borderRadius: "6px 0 0 6px",
            background: agencyColor(primaryRow.agency),
          }}
        />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Thumbnail row={primaryRow} />

        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Ad name */}
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              lineHeight: "16px",
              color: "#60A7C8",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginBottom: 4,
            }}
            title={primaryRow.generatedAdName}
          >
            {primaryRow.generatedAdName}
          </div>

          {/* Pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
            {primaryRow.agency && (
              <Pill label={primaryRow.agency} color={agencyColor(primaryRow.agency)} />
            )}
            {primaryRow.angle && <Pill label={primaryRow.angle} />}
            {primaryRow.source && <Pill label={primaryRow.source} />}
          </div>

          {/* Dimension badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 4 }}>
            {dimensionEntries.map((d, i) => (
              <DimensionBadge key={i} aspect={d.aspect} status={d.status} />
            ))}
          </div>

          {/* File count + completeness */}
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{sizeCount} {sizeCount === 1 ? "size" : "sizes"}</span>
            {(() => {
              const aspects = new Set(dimensionEntries.map((d) => d.aspect));
              const hasStory = [...aspects].some((a) => STORY_DIMS.has(a));
              const hasFeed = [...aspects].some((a) => FEED_DIMS.has(a));
              if (hasStory && hasFeed) return null;
              const label = !hasStory && !hasFeed ? "!story+feed" : !hasStory ? "!story" : "!feed";
              return (
                <span style={{ color: "#fb923c", fontWeight: 500 }}>{label}</span>
              );
            })()}
          </div>

          {/* Meta Ad ID for uploaded */}
          {metaId && (
            <div
              style={{
                marginTop: 4,
                fontSize: 10,
                fontFamily: "'IBM Plex Mono', monospace",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>Meta: </span>
              <a
                href={`https://www.facebook.com/ads/manager/account/ads?act=&selected_ad_ids=${metaId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#58a6ff", textDecoration: "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                {metaId}
              </a>
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <div
              style={{
                marginTop: 4,
                fontSize: 10,
                lineHeight: "14px",
                color: "#f85149",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={errorMsg}
            >
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function PipelineView({
  groups,
  onSelect,
  selectedKeys,
}: PipelineViewProps) {
  // Bucket groups into columns
  const buckets = useMemo(() => {
    const map: Record<Status, Group[]> = {
      draft: [],
      ready: [],
      uploading: [],
      uploaded: [],
      error: [],
    };
    for (const g of groups) {
      map[groupStatus(g.rows)].push(g);
    }
    return map;
  }, [groups]);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        height: "100%",
        overflowX: "auto",
        padding: "0 4px 4px",
      }}
    >
      {COLUMNS.map((col) => {
        const Icon = col.icon;
        const items = buckets[col.status];
        const isUploading = col.status === "uploading";

        return (
          <div
            key={col.status}
            style={{
              minWidth: 260,
              maxWidth: 320,
              flex: "1 0 260px",
              display: "flex",
              flexDirection: "column",
              borderRadius: 8,
              background: "var(--surface-0)",
              border: "1px solid var(--surface-2)",
              overflow: "hidden",
            }}
          >
            {/* Top color bar */}
            <div style={{ height: 2, background: col.borderColor }} />

            {/* Column header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 12px 8px",
                background: col.bgColor,
              }}
            >
              <Icon
                size={14}
                style={{
                  color: col.textColor,
                  ...(isUploading
                    ? { animation: "pipeline-spin 1s linear infinite" }
                    : {}),
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: col.textColor,
                }}
              >
                {col.label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "'IBM Plex Mono', monospace",
                  minWidth: 20,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9,
                  background: items.length > 0 ? col.bgColor : "transparent",
                  border:
                    items.length > 0
                      ? `1px solid ${col.borderColor}40`
                      : "1px solid transparent",
                  color: col.textColor,
                  padding: "0 6px",
                }}
              >
                {items.length}
              </span>
            </div>

            {/* Scrollable card list */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {items.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "24px 8px",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  No creatives
                </div>
              )}
              {items.map((g) => (
                <PipelineCard
                  key={g.key}
                  group={g}
                  selected={selectedKeys.has(g.key)}
                  onSelect={() => onSelect(g.key)}
                  colStatus={col.status}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Keyframe for uploading spinner */}
      <style>{`
        @keyframes pipeline-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
