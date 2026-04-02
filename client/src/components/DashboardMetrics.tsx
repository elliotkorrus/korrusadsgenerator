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
  marginBottom: 8,
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const valueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "var(--text-primary)",
  lineHeight: 1,
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  borderRadius: 10,
  padding: 16,
  minWidth: 120,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 6,
  boxShadow: "var(--shadow-sm)",
  border: "1px solid var(--surface-2)",
  transition: "box-shadow 0.15s ease, border-color 0.15s ease",
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
    const maxProducerCount = producerSorted.length > 0 ? producerSorted[0][1] : 0;

    // Missing sizes — a concept is complete when it has at least one Story (9:16)
    // AND at least one Feed (4:5, 1:1, or 16:9) dimension.
    const conceptGroups: Record<string, Set<string>> = {};
    for (const item of items) {
      const key = item.conceptKey || `__solo_${item.id}`;
      if (!conceptGroups[key]) conceptGroups[key] = new Set();
      conceptGroups[key].add(item.dimensions);
    }
    let missingStory = 0;
    let missingFeed = 0;
    for (const dims of Object.values(conceptGroups)) {
      const hasStory = STORY_DIMS.some((d) => dims.has(d));
      const hasFeed = FEED_DIMS.some((d) => dims.has(d));
      if (!hasStory) missingStory++;
      if (!hasFeed) missingFeed++;
    }
    const incomplete = missingStory + missingFeed > 0
      ? Object.values(conceptGroups).filter((dims) => {
          const hasStory = STORY_DIMS.some((d) => dims.has(d));
          const hasFeed = FEED_DIMS.some((d) => dims.has(d));
          return !hasStory || !hasFeed;
        }).length
      : 0;

    return {
      total,
      statusCounts,
      readyCount,
      uploadedCount,
      uploadedPct,
      needsAttention,
      producerSorted,
      maxProducerCount,
      incomplete,
      missingStory,
      missingFeed,
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

  const visibleProducers = metrics.producerSorted.slice(0, 4);
  const hiddenProducerCount = Math.max(0, metrics.producerSorted.length - 4);

  return (
    <div
      style={{
        background: "linear-gradient(180deg, var(--surface-0) 0%, var(--surface-1) 100%)",
        borderBottom: "1px solid var(--surface-2)",
        padding: "14px 20px",
        overflowX: "auto",
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 16,
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
          <span style={{ ...valueStyle, color: "#0099C6" }}>{metrics.readyCount}</span>
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
                color: metrics.needsAttention > 0 ? "#d97706" : "var(--text-muted)",
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

        {/* By Producer */}
        <div style={{ ...cardStyle, minWidth: 180 }}>
          <div style={labelStyle}>By Producer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {visibleProducers.length === 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No items</span>
            )}
            {visibleProducers.map(([name, count]) => {
              const barPct =
                metrics.maxProducerCount > 0
                  ? (count / metrics.maxProducerCount) * 100
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
            {hiddenProducerCount > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 64 }}>
                +{hiddenProducerCount} more
              </span>
            )}
          </div>
        </div>

        {/* Incomplete Concepts */}
        <div style={cardStyle}>
          <div style={labelStyle}>Incomplete</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                ...valueStyle,
                color: metrics.incomplete > 0 ? "#fb923c" : "var(--text-muted)",
              }}
            >
              {metrics.incomplete}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                fontWeight: 400,
              }}
            >
              {metrics.incomplete === 1 ? "concept" : "concepts"}
            </span>
          </div>
          {metrics.incomplete > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              {metrics.missingStory > 0 && (
                <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 500 }}>
                  {metrics.missingStory} no story
                </span>
              )}
              {metrics.missingFeed > 0 && (
                <span style={{ fontSize: 10, color: "#38bdf8", fontWeight: 500 }}>
                  {metrics.missingFeed} no feed
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
