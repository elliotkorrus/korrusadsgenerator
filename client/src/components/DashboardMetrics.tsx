import { useMemo } from "react";

interface DashboardMetricsProps {
  items: Array<{
    id: number;
    status: string;
    agency: string | null;
    source: string | null;
    dimensions: string;
    contentType: string;
    conceptKey: string | null;
    createdAt: string;
    uploadedAt: string | null;
    adSetId: string | null;
    fileUrl: string | null;
  }>;
}

const STORY_DIMS = ["9:16"];
const FEED_DIMS = ["4:5", "1:1", "16:9"];

const STATUS_COLORS: Record<string, string> = {
  draft: "#484f58",
  ready: "#4ade80",
  uploading: "#60a5fa",
  uploaded: "#34d399",
  error: "#f87171",
};

export default function DashboardMetrics({ items }: DashboardMetricsProps) {
  const metrics = useMemo(() => {
    const total = items.length;

    const statusCounts: Record<string, number> = {};
    for (const item of items) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    }

    const readyCount = statusCounts["ready"] || 0;
    const uploadedCount = statusCounts["uploaded"] || 0;
    const errorCount = statusCounts["error"] || 0;

    const draftNeedsAttention = items.filter(
      (i) => i.status === "draft" && (!i.adSetId || !i.fileUrl)
    ).length;
    const needsAttention = errorCount + draftNeedsAttention;

    const uploadedPct = total > 0 ? Math.round((uploadedCount / total) * 100) : 0;

    // Producer breakdown
    const producerCounts: Record<string, number> = {};
    for (const item of items) {
      const key = item.source || "Untagged";
      producerCounts[key] = (producerCounts[key] || 0) + 1;
    }
    const producerSorted = Object.entries(producerCounts).sort((a, b) => b[1] - a[1]);

    // Missing sizes
    const conceptGroups: Record<string, Set<string>> = {};
    for (const item of items) {
      const key = item.conceptKey || `__solo_${item.id}`;
      if (!conceptGroups[key]) conceptGroups[key] = new Set();
      conceptGroups[key].add(item.dimensions);
    }
    const incomplete = Object.values(conceptGroups).filter((dims) => {
      const hasStory = STORY_DIMS.some((d) => dims.has(d));
      const hasFeed = FEED_DIMS.some((d) => dims.has(d));
      return !hasStory || !hasFeed;
    }).length;

    return {
      total,
      statusCounts,
      readyCount,
      uploadedCount,
      uploadedPct,
      needsAttention,
      producerSorted,
      incomplete,
    };
  }, [items]);

  // Status bar segments
  const statusOrder = ["draft", "ready", "uploading", "uploaded", "error"];
  const statusSegments = statusOrder
    .filter((s) => (metrics.statusCounts[s] || 0) > 0)
    .map((s) => ({
      status: s,
      count: metrics.statusCounts[s] || 0,
      color: STATUS_COLORS[s] || "#484f58",
      pct: metrics.total > 0 ? (metrics.statusCounts[s] / metrics.total) * 100 : 0,
    }));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "8px 20px",
        borderBottom: "1px solid var(--surface-2)",
        background: "var(--surface-0)",
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: 11,
        minHeight: 36,
        flexShrink: 0,
      }}
    >
      {/* Total + status bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {metrics.total}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>ads</span>
        {metrics.total > 0 && (
          <div
            style={{
              display: "flex",
              height: 4,
              borderRadius: 2,
              overflow: "hidden",
              width: 64,
              background: "var(--surface-3)",
            }}
          >
            {statusSegments.map((seg) => (
              <div
                key={seg.status}
                style={{
                  width: `${seg.pct}%`,
                  minWidth: seg.pct > 0 ? 2 : 0,
                  background: seg.color,
                }}
                title={`${seg.status}: ${seg.count}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 14, background: "var(--surface-3)" }} />

      {/* Uploaded */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ color: "#34d399", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {metrics.uploadedCount}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
          uploaded ({metrics.uploadedPct}%)
        </span>
      </div>

      {/* Ready */}
      {metrics.readyCount > 0 && (
        <>
          <div style={{ width: 1, height: 14, background: "var(--surface-3)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#0099C6", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {metrics.readyCount}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 10 }}>ready</span>
          </div>
        </>
      )}

      {/* Needs Attention */}
      {metrics.needsAttention > 0 && (
        <>
          <div style={{ width: 1, height: 14, background: "var(--surface-3)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#d97706", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {metrics.needsAttention}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 10 }}>needs attention</span>
          </div>
        </>
      )}

      {/* Incomplete */}
      {metrics.incomplete > 0 && (
        <>
          <div style={{ width: 1, height: 14, background: "var(--surface-3)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#fb923c", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {metrics.incomplete}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 10 }}>incomplete</span>
          </div>
        </>
      )}

      {/* Producer breakdown — compact */}
      {metrics.producerSorted.length > 0 && (
        <>
          <div style={{ width: 1, height: 14, background: "var(--surface-3)", marginLeft: "auto" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {metrics.producerSorted.slice(0, 5).map(([name, count]) => (
              <span key={name} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {count}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
