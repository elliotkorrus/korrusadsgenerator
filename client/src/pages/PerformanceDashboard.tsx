import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick, ShoppingCart, Loader2, RefreshCw } from "lucide-react";

const DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "Last 7 Days" },
  { value: "last_14d", label: "Last 14 Days" },
  { value: "last_30d", label: "Last 30 Days" },
] as const;

type DateRange = typeof DATE_RANGES[number]["value"];

interface InsightRow {
  adId: string;
  adName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  cpc: number;
  cpm: number;
  purchases: number;
  costPerPurchase: number;
  roas: string;
}

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>{label}</span>
        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <div className="text-xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function SortHeader({ label, sortKey, current, direction, onSort }: {
  label: string; sortKey: string; current: string; direction: "asc" | "desc"; onSort: (key: string) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="px-3 py-2.5 text-left font-semibold uppercase cursor-pointer select-none"
      style={{ fontSize: "9px", letterSpacing: "0.08em", color: active ? "#60A7C8" : "var(--text-muted)" }}
      onClick={() => onSort(sortKey)}
    >
      {label} {active ? (direction === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

export default function PerformanceDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("last_7d");
  const { data: insights = [], isLoading, isError, error, refetch } = trpc.meta.getAdInsights.useQuery(
    { dateRange },
    { staleTime: 5 * 60 * 1000 }
  );

  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const rows = insights as InsightRow[];

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aVal = (a as any)[sortKey] ?? 0;
      const bVal = (b as any)[sortKey] ?? 0;
      const numA = typeof aVal === "string" ? parseFloat(aVal) : aVal;
      const numB = typeof bVal === "string" ? parseFloat(bVal) : bVal;
      return sortDir === "asc" ? numA - numB : numB - numA;
    });
  }, [rows, sortKey, sortDir]);

  // Aggregates
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, spend: 0, purchases: 0 };
    for (const r of rows) {
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.spend += r.spend;
      t.purchases += r.purchases;
    }
    return {
      ...t,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions * 100).toFixed(2) : "0",
      cpc: t.clicks > 0 ? (t.spend / t.clicks).toFixed(2) : "0",
      cpm: t.impressions > 0 ? (t.spend / t.impressions * 1000).toFixed(2) : "0",
      costPerPurchase: t.purchases > 0 ? (t.spend / t.purchases).toFixed(2) : "—",
    };
  }, [rows]);

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "var(--surface-0)" }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--surface-2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold leading-none" style={{ fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
              Performance Dashboard
            </h2>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Live ad performance from Meta Ads — {rows.length} ad{rows.length !== 1 ? "s" : ""} reporting
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
              {DATE_RANGES.map(r => (
                <button
                  key={r.value}
                  onClick={() => setDateRange(r.value)}
                  className="px-3 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    background: dateRange === r.value ? "rgba(0,153,198,0.15)" : "var(--surface-1)",
                    color: dateRange === r.value ? "#60A7C8" : "var(--text-secondary)",
                    borderRight: "1px solid var(--surface-3)",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-1.5 rounded-md transition-colors"
              style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", color: "var(--text-secondary)" }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total Spend" value={`$${totals.spend.toFixed(2)}`} icon={DollarSign} color="#ef4444" />
          <MetricCard label="Impressions" value={totals.impressions.toLocaleString()} sub={`$${totals.cpm} CPM`} icon={Eye} color="#3b82f6" />
          <MetricCard label="Clicks" value={totals.clicks.toLocaleString()} sub={`${totals.ctr}% CTR · $${totals.cpc} CPC`} icon={MousePointerClick} color="#f59e0b" />
          <MetricCard label="Purchases" value={totals.purchases.toString()} sub={totals.costPerPurchase !== "—" ? `$${totals.costPerPurchase} CPA` : "No purchases"} icon={ShoppingCart} color="#10b981" />
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin mr-2" style={{ color: "#60A7C8" }} />
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading insights from Meta…</span>
          </div>
        )}

        {isError && (
          <div className="rounded-lg p-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-[12px] font-medium" style={{ color: "#ef4444" }}>Failed to load insights</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{(error as any)?.message || "Check Meta Settings to ensure your access token is valid."}</p>
          </div>
        )}

        {/* Table */}
        {!isLoading && rows.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
            <table className="w-full" style={{ fontSize: "11px", borderCollapse: "collapse" }}>
              <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold uppercase" style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Ad Name</th>
                  <SortHeader label="Spend" sortKey="spend" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="Impr." sortKey="impressions" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="Clicks" sortKey="clicks" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="CTR" sortKey="ctr" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="CPC" sortKey="cpc" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="CPM" sortKey="cpm" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="Purchases" sortKey="purchases" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="CPA" sortKey="costPerPurchase" current={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortHeader label="ROAS" sortKey="roas" current={sortKey} direction={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr
                    key={row.adId}
                    style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.025)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    <td className="px-3 py-2.5 max-w-[240px] truncate" style={{ color: "var(--text-primary)" }} title={row.adName}>
                      {row.adName}
                    </td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "#ef4444" }}>${row.spend.toFixed(2)}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>{row.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>{row.clicks.toLocaleString()}</td>
                    <td className="px-3 py-2.5" style={{ color: row.ctr > 2 ? "#10b981" : "var(--text-secondary)" }}>{row.ctr.toFixed(2)}%</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>${row.cpc.toFixed(2)}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>${row.cpm.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: row.purchases > 0 ? "#10b981" : "var(--text-muted)" }}>
                      {row.purchases || "—"}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {row.costPerPurchase > 0 ? `$${row.costPerPurchase.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: parseFloat(row.roas) >= 2 ? "#10b981" : parseFloat(row.roas) >= 1 ? "#f59e0b" : "var(--text-muted)" }}>
                      {parseFloat(row.roas) > 0 ? `${row.roas}x` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <TrendingUp className="w-8 h-8 mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No performance data yet</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
              Upload ads to Meta from the Queue to start seeing performance data here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
