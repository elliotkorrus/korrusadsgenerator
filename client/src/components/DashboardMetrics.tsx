import { useMemo } from "react";

interface DashboardMetricsProps {
  items: Array<{
    id: number;
    status: string;
    agency: string | null;
    dimensions: string;
    contentType: string;
    conceptKey: string | null;
    createdAt: string;
    uploadedAt: string | null;
    adSetId: string | null;
    fileUrl: string | null;
  }>;
}

const REQUIRED_DIMENSIONS = ["9:16", "4:5", "1:1", "16:9"];

const AGENCY_PALETTE = [
  "#60A7C8",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#38bdf8",
  "#c084fc",
  "#4ade80",
];

function agencyColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENCY_PALETTE[Math.abs(hash) % AGENCY_PALETTE.length];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#484f58",
  ready: "#4ade80",
  uploading: "#60a5fa",
  uploaded: "#34d399",
  error: "#f87171",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  lineHeight: 1,
  marginBottom: 4,
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const valueStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: "var(--text-primary)",
  lineHeight: 1,
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  borderRadius: 8,
  padding: "12px 16px",
  minWidth: 120,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 6,
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

    // Agency breakdown
    const agencyCounts: Record<string, number> = {};
    for (const item of items) {
      const key = item.agency || "Untagged";
      agencyCounts[key] = (agencyCounts[key] || 0) + 1;
    }
    const agencySorted = Object.entries(agencyCounts).sort((a, b) => b[1] - a[1]);
    const maxAgencyCount = agencySorted.length > 0 ? agencySorted[0][1] : 0;

    // Missing sizes
    const conceptGroups: Record<string, Set<string>> = {};
    for (const item of items) {
      const key = item.conceptKey || `__solo_${item.id}`;
      if (!conceptGroups[key]) conceptGroups[key] = new Set();
      conceptGroups[key].add(item.dimensions);
    }
    let missingSizes = 0;
    for (const dims of Object.values(conceptGroups)) {
      const hasAll = REQUIRED_DIMENSIONS.every((d) => dims.has(d));
      if (!hasAll) missingSizes++;
    }

    return {
      total,
      statusCounts,
      readyCount,
      uploadedCount,
      uploadedPct,
      needsAttention,
      agencySorted,
      maxAgencyCount,
      missingSizes,
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

  const visibleAgencies = metrics.agencySorted.slice(0, 4);
  const hiddenAgencyCount = Math.max(0, metrics.agencySorted.length - 4);

  return (
    <div
      style={{
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--surface-3)",
        padding: "12px 20px",
        overflowX: "auto",
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          minWidth: "max-content",
          alignItems: "stretch",
        }}
      >
        {/* Total Creatives */}
        <div style={cardStyle}>
          <div style={labelStyle}>Total Creatives</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={valueStyle}>{metrics.total}</span>
            {metrics.total > 0 && (
              <div
                style={{
                  display: "flex",
                  height: 6,
                  borderRadius: 3,
                  overflow: "hidden",
                  flex: 1,
                  minWidth: 60,
                  background: "var(--surface-3)",
                }}
              >
                {statusSegments.map((seg) => (
                  <div
                    key={seg.status}
                    style={{
                      width: `${seg.pct}%`,
                      minWidth: seg.pct > 0 ? 3 : 0,
                      background: seg.color,
                    }}
                    title={`${seg.status}: ${seg.count}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ready to Upload */}
        <div style={cardStyle}>
          <div style={labelStyle}>Ready to Upload</div>
          <span style={{ ...valueStyle, color: "#4ade80" }}>{metrics.readyCount}</span>
        </div>

        {/* Uploaded */}
        <div style={cardStyle}>
          <div style={labelStyle}>Uploaded</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ ...valueStyle, color: "#34d399" }}>{metrics.uploadedCount}</span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                fontWeight: 500,
              }}
            >
              {metrics.uploadedPct}%
            </span>
          </div>
        </div>

        {/* Needs Attention */}
        <div style={cardStyle}>
          <div style={labelStyle}>Needs Attention</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                ...valueStyle,
                color: metrics.needsAttention > 0 ? "#f59e0b" : "var(--text-muted)",
              }}
            >
              {metrics.needsAttention}
            </span>
            {metrics.needsAttention > 0 && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#ef4444",
                  display: "inline-block",
                  animation: "pulse-dot 2s ease-in-out infinite",
                }}
              />
            )}
          </div>
          <style>{`
            @keyframes pulse-dot {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.85); }
            }
          `}</style>
        </div>

        {/* By Agency */}
        <div style={{ ...cardStyle, minWidth: 180 }}>
          <div style={labelStyle}>By Agency</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {visibleAgencies.length === 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No items</span>
            )}
            {visibleAgencies.map(([name, count]) => {
              const barPct =
                metrics.maxAgencyCount > 0
                  ? (count / metrics.maxAgencyCount) * 100
                  : 0;
              const color = agencyColor(name);
              return (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 14,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      width: 56,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      textAlign: "right",
                    }}
                    title={name}
                  >
                    {name}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      borderRadius: 2,
                      background: "var(--surface-3)",
                      overflow: "hidden",
                      minWidth: 40,
                    }}
                  >
                    <div
                      style={{
                        width: `${barPct}%`,
                        minWidth: barPct > 0 ? 3 : 0,
                        height: "100%",
                        borderRadius: 2,
                        background: color,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color,
                      minWidth: 16,
                      textAlign: "right",
                    }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
            {hiddenAgencyCount > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 64 }}>
                +{hiddenAgencyCount} more
              </span>
            )}
          </div>
        </div>

        {/* Missing Sizes */}
        <div style={cardStyle}>
          <div style={labelStyle}>Missing Sizes</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                ...valueStyle,
                color: metrics.missingSizes > 0 ? "#fb923c" : "var(--text-muted)",
              }}
            >
              {metrics.missingSizes}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                fontWeight: 400,
              }}
            >
              {metrics.missingSizes === 1 ? "concept" : "concepts"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
