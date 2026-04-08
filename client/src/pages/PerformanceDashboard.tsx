import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import {
  DollarSign, Eye, MousePointerClick, ShoppingCart,
  Loader2, RefreshCw, TrendingUp, ChevronDown, Image as ImageIcon, BarChart3,
} from "lucide-react";
import LazyThumbnail from "../components/LazyThumbnail";

// ── Config ──────────────────────────────────────────────────────

const DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "7 Days" },
  { value: "last_14d", label: "14 Days" },
  { value: "last_30d", label: "30 Days" },
] as const;
type DateRange = typeof DATE_RANGES[number]["value"];

const PIVOT_FIELDS = [
  { key: "none", label: "All Ads (no grouping)" },
  { key: "handle", label: "Handle" },
  { key: "initiative", label: "Initiative" },
  { key: "variation", label: "Variation" },
  { key: "angle", label: "Theme" },
  { key: "creativeType", label: "Creative Style" },
  { key: "source", label: "Producer" },
  { key: "contentType", label: "Ad Format" },
  { key: "dimensions", label: "Dimensions" },
  { key: "copySlug", label: "Copy" },
  { key: "product", label: "Product" },
  { key: "date", label: "Date" },
] as const;
type PivotKey = typeof PIVOT_FIELDS[number]["key"];

// ── Types ───────────────────────────────────────────────────────

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
  roas: number;
  fileUrl: string;
  fileMimeType: string;
  // Naming fields
  handle: string;
  initiative: string;
  variation: string;
  angle: string;
  creativeType: string;
  source: string;
  contentType: string;
  dimensions: string;
  copySlug: string;
  product: string;
  date: string;
  filename: string;
}

interface AggRow {
  groupKey: string;
  count: number;
  impressions: number;
  clicks: number;
  spend: number;
  purchases: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerPurchase: number;
  roas: number;
  // For thumbnail: first fileUrl found
  fileUrl: string;
  fileMimeType: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function aggregate(rows: InsightRow[], pivotKey: PivotKey): AggRow[] {
  if (pivotKey === "none") {
    // Return individual rows as-is, wrapped in AggRow
    return rows.map(r => ({
      groupKey: r.adName,
      count: 1,
      impressions: r.impressions,
      clicks: r.clicks,
      spend: r.spend,
      purchases: r.purchases,
      ctr: r.ctr,
      cpc: r.cpc,
      cpm: r.cpm,
      costPerPurchase: r.costPerPurchase,
      roas: r.roas,
      fileUrl: r.fileUrl,
      fileMimeType: r.fileMimeType,
    }));
  }

  const map = new Map<string, { impressions: number; clicks: number; spend: number; purchases: number; count: number; fileUrl: string; fileMimeType: string }>();
  for (const r of rows) {
    const key = (r as any)[pivotKey] || "(empty)";
    const existing = map.get(key);
    if (existing) {
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
      existing.spend += r.spend;
      existing.purchases += r.purchases;
      existing.count++;
      if (!existing.fileUrl && r.fileUrl) { existing.fileUrl = r.fileUrl; existing.fileMimeType = r.fileMimeType; }
    } else {
      map.set(key, {
        impressions: r.impressions, clicks: r.clicks, spend: r.spend,
        purchases: r.purchases, count: 1, fileUrl: r.fileUrl, fileMimeType: r.fileMimeType,
      });
    }
  }
  return Array.from(map.entries()).map(([groupKey, v]) => ({
    groupKey,
    count: v.count,
    impressions: v.impressions,
    clicks: v.clicks,
    spend: v.spend,
    purchases: v.purchases,
    ctr: v.impressions > 0 ? v.clicks / v.impressions * 100 : 0,
    cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
    cpm: v.impressions > 0 ? v.spend / v.impressions * 1000 : 0,
    costPerPurchase: v.purchases > 0 ? v.spend / v.purchases : 0,
    roas: v.purchases > 0 && v.spend > 0 ? v.purchases * 50 / v.spend : 0,
    fileUrl: v.fileUrl,
    fileMimeType: v.fileMimeType,
  }));
}

function fmt$(n: number) { return `$${n.toFixed(2)}`; }
function fmtPct(n: number) { return `${n.toFixed(2)}%`; }
function fmtNum(n: number) { return n.toLocaleString(); }

// ── Components ──────────────────────────────────────────────────

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

function SortHeader({ label, sortKey, current, direction, onSort, align }: {
  label: string; sortKey: string; current: string; direction: "asc" | "desc"; onSort: (key: string) => void; align?: "right";
}) {
  const active = current === sortKey;
  return (
    <th
      className="px-3 py-2.5 font-semibold uppercase cursor-pointer select-none whitespace-nowrap"
      style={{ fontSize: "9px", letterSpacing: "0.08em", color: active ? "#60A7C8" : "var(--text-muted)", textAlign: align || "left" }}
      onClick={() => onSort(sortKey)}
    >
      {label} {active ? (direction === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

function Thumbnail({ url, mimeType }: { url: string; mimeType: string }) {
  if (!url) {
    return (
      <div
        className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--surface-2)", border: "1px solid var(--surface-3)" }}
      >
        <ImageIcon className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }
  return (
    <div
      className="w-9 h-9 rounded overflow-hidden flex-shrink-0"
      style={{ border: "1px solid var(--surface-3)" }}
    >
      {mimeType?.startsWith("video/") ? (
        <video src={url} muted className="w-full h-full object-cover" />
      ) : (
        <LazyThumbnail src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );
}

// ── Bar for pivot rows (visual proportion) ──────────────────────

function SpendBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #0099C6, #60A7C8)" }} />
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────

export default function PerformanceDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("last_7d");
  const { data: insights = [], isLoading, isError, error, refetch } = trpc.meta.getAdInsights.useQuery(
    { dateRange },
    { staleTime: 5 * 60 * 1000 }
  );

  const [pivotKey, setPivotKey] = useState<PivotKey>("none");
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const rows = insights as InsightRow[];

  // Aggregate by pivot
  const pivotRows = useMemo(() => aggregate(rows, pivotKey), [rows, pivotKey]);

  // Sort
  const sorted = useMemo(() => {
    return [...pivotRows].sort((a, b) => {
      const aVal = (a as any)[sortKey] ?? 0;
      const bVal = (b as any)[sortKey] ?? 0;
      const numA = typeof aVal === "string" ? parseFloat(aVal) || 0 : aVal;
      const numB = typeof bVal === "string" ? parseFloat(bVal) || 0 : bVal;
      return sortDir === "asc" ? numA - numB : numB - numA;
    });
  }, [pivotRows, sortKey, sortDir]);

  const maxSpend = useMemo(() => Math.max(...pivotRows.map(r => r.spend), 1), [pivotRows]);

  // Grand totals
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

  const pivotLabel = PIVOT_FIELDS.find(f => f.key === pivotKey)?.label || "All Ads";
  const isPivoted = pivotKey !== "none";

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "var(--surface-0)" }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--surface-2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold leading-none" style={{ fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
              Performance
            </h2>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {rows.length} ad{rows.length !== 1 ? "s" : ""} reporting
              {isPivoted && ` · ${pivotRows.length} group${pivotRows.length !== 1 ? "s" : ""} by ${pivotLabel}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Pivot selector */}
            <div className="relative">
              <select
                value={pivotKey}
                onChange={(e) => { setPivotKey(e.target.value as PivotKey); setSortKey("spend"); setSortDir("desc"); }}
                className="appearance-none pr-7 pl-3 py-1.5 text-[11px] font-medium rounded-md cursor-pointer focus:outline-none"
                style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", color: isPivoted ? "#60A7C8" : "var(--text-secondary)" }}
              >
                {PIVOT_FIELDS.map(f => (
                  <option key={f.key} value={f.key}>{f.key === "none" ? "Group by…" : `By ${f.label}`}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            </div>

            {/* Date range */}
            <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
              {DATE_RANGES.map(r => (
                <button
                  key={r.value}
                  onClick={() => setDateRange(r.value)}
                  className="px-2.5 py-1.5 text-[11px] font-medium transition-colors"
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
          <MetricCard label="Total Spend" value={fmt$(totals.spend)} icon={DollarSign} color="#ef4444" />
          <MetricCard label="Impressions" value={fmtNum(totals.impressions)} sub={`$${totals.cpm} CPM`} icon={Eye} color="#3b82f6" />
          <MetricCard label="Clicks" value={fmtNum(totals.clicks)} sub={`${totals.ctr}% CTR · $${totals.cpc} CPC`} icon={MousePointerClick} color="#f59e0b" />
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
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{(error as any)?.message || "Check Meta Settings."}</p>
          </div>
        )}

        {/* Table */}
        {!isLoading && sorted.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: "11px", borderCollapse: "collapse" }}>
                <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold uppercase w-8" style={{ fontSize: "9px", color: "var(--text-muted)" }}></th>
                    <th className="px-3 py-2.5 text-left font-semibold uppercase" style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                      {isPivoted ? pivotLabel : "Ad Name"}
                    </th>
                    {isPivoted && (
                      <SortHeader label="Ads" sortKey="count" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    )}
                    <SortHeader label="Spend" sortKey="spend" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <th className="px-3 py-2.5 w-20" style={{ fontSize: "9px", color: "var(--text-muted)" }}></th>
                    <SortHeader label="Impr." sortKey="impressions" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="Clicks" sortKey="clicks" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="CTR" sortKey="ctr" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="CPC" sortKey="cpc" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="CPM" sortKey="cpm" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="Purch." sortKey="purchases" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="CPA" sortKey="costPerPurchase" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                    <SortHeader label="ROAS" sortKey="roas" current={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr
                      key={row.groupKey + i}
                      style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.025)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                    >
                      <td className="px-3 py-2">
                        <Thumbnail url={row.fileUrl} mimeType={row.fileMimeType} />
                      </td>
                      <td className="px-3 py-2 max-w-[280px]" title={row.groupKey}>
                        <span
                          className={isPivoted ? "text-[12px] font-semibold" : "text-[11px] font-mono"}
                          style={{ color: isPivoted ? "#60A7C8" : "var(--text-primary)" }}
                        >
                          {isPivoted && row.groupKey === "(empty)" ? (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Not set</span>
                          ) : (
                            <span className="break-all">{row.groupKey}</span>
                          )}
                        </span>
                      </td>
                      {isPivoted && (
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{row.count}</td>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: "#ef4444" }}>{fmt$(row.spend)}</td>
                      <td className="px-3 py-2"><SpendBar value={row.spend} max={maxSpend} /></td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtNum(row.impressions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmtNum(row.clicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: row.ctr > 2 ? "#10b981" : "var(--text-secondary)" }}>{fmtPct(row.ctr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmt$(row.cpc)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmt$(row.cpm)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: row.purchases > 0 ? "#10b981" : "var(--text-muted)" }}>
                        {row.purchases || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {row.costPerPurchase > 0 ? fmt$(row.costPerPurchase) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: row.roas >= 2 ? "#10b981" : row.roas >= 1 ? "#f59e0b" : "var(--text-muted)" }}>
                        {row.roas > 0 ? `${row.roas.toFixed(2)}x` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--surface-3)", background: "var(--surface-1)" }}>
                    <td className="px-3 py-2.5"></td>
                    <td className="px-3 py-2.5 text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>
                      Total ({sorted.length} {isPivoted ? "groups" : "ads"})
                    </td>
                    {isPivoted && <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>{rows.length}</td>}
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "#ef4444" }}>{fmt$(totals.spend)}</td>
                    <td></td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>{fmtNum(totals.impressions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>{fmtNum(totals.clicks)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>{totals.ctr}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>${totals.cpc}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>${totals.cpm}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: totals.purchases > 0 ? "#10b981" : "var(--text-primary)" }}>{totals.purchases}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "var(--text-primary)" }}>{totals.costPerPurchase}</td>
                    <td className="px-3 py-2.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="w-8 h-8 mb-3" style={{ color: "var(--text-muted)" }} />
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
