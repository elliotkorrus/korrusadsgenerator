import { trpc } from "../lib/trpc";
import { RefreshCw, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

export default function UploadHistory() {
  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.queue.list.useQuery({ status: undefined });
  const historyItems = items.filter((i) => i.status === "uploaded" || i.status === "error");

  const uploaded = historyItems.filter((i) => i.status === "uploaded").length;
  const errors = historyItems.filter((i) => i.status === "error").length;

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "var(--surface-0)" }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--surface-3)" }}>
        <div>
          <h2 className="font-semibold" style={{ fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>Upload History</h2>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Ads that have been sent to Meta or encountered errors</p>
        </div>
        <button
          onClick={() => utils.queue.list.invalidate()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md transition-colors"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--surface-3)", background: "transparent" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,153,198,0.4)"; (e.currentTarget as HTMLButtonElement).style.color = "#60A7C8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--surface-3)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Stats */}
      {historyItems.length > 0 && (
        <div className="flex-shrink-0 px-6 py-3 flex items-center gap-4" style={{ borderBottom: "1px solid var(--surface-3)" }}>
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#4ade80" }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-semibold">{uploaded}</span>
            <span style={{ color: "var(--text-muted)" }}>uploaded</span>
          </div>
          {errors > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#f87171" }}>
              <XCircle className="w-3.5 h-3.5" />
              <span className="font-semibold">{errors}</span>
              <span style={{ color: "var(--text-muted)" }}>failed</span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 px-6 py-4">
        {historyItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 className="w-8 h-8" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>No upload history yet</p>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", opacity: 0.6 }}>Ads marked Ready and sent via MANUS will appear here</p>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
            <table className="w-full" style={{ fontSize: "11px", borderCollapse: "collapse" }}>
              <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
                <tr>
                  {["Status", "Ad Name", "Dims", "Format", "Ad Set", "Meta Ad ID", "Uploaded At", "Error"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase" style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyItems.map((item, i) => (
                  <tr
                    key={item.id}
                    style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.025)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-sm border"
                        style={item.status === "uploaded"
                          ? { background: "rgba(74,222,128,0.08)", color: "#4ade80", borderColor: "rgba(74,222,128,0.2)" }
                          : { background: "rgba(248,113,113,0.08)", color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }
                        }
                      >
                        {item.status === "uploaded" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <span
                        className="block truncate"
                        title={item.generatedAdName}
                        style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#60A7C8" }}
                      >
                        {item.generatedAdName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{item.dimensions}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{item.contentType}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{item.adSetName || item.adSetId || "—"}</td>
                    <td className="px-4 py-2.5">
                      {item.metaAdId ? (
                        <a
                          href={`https://www.facebook.com/adsmanager/manage/ads?act=${item.metaAdId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px]"
                          style={{ color: "#60A7C8", fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          {item.metaAdId.slice(0, 12)}… <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                      {item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-2.5 max-w-[180px]">
                      {item.errorMessage ? (
                        <span className="block truncate text-[10px]" title={item.errorMessage} style={{ color: "#f87171" }}>{item.errorMessage}</span>
                      ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
