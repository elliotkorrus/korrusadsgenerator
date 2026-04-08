import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Calendar, Clock, Trash2, Loader2, Plus, CheckCircle2, AlertTriangle, X } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";

type ScheduledJob = {
  id: number;
  adIds: string;
  scheduledAt: string;
  status: string;
  result: string | null;
  createdAt: string;
};

const statusConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
  pending: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", label: "Pending" },
  running: { color: "#3b82f6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)", label: "Running" },
  completed: { color: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)", label: "Completed" },
  failed: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", label: "Failed" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

export default function ScheduledUploads() {
  const utils = trpc.useUtils();
  const { data: jobs = [], isLoading } = trpc.scheduled.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const createMut = trpc.scheduled.create.useMutation({
    onSuccess: () => { utils.scheduled.list.invalidate(); setShowCreate(false); },
  });
  const cancelMut = trpc.scheduled.cancel.useMutation({
    onSuccess: () => utils.scheduled.list.invalidate(),
  });

  // Get ready ads for scheduling
  const { data: allAds = [] } = trpc.queue.list.useQuery({ status: "ready" });

  const [showCreate, setShowCreate] = useState(false);
  const [selectedAdIds, setSelectedAdIds] = useState<Set<number>>(new Set());
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number } | null>(null);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (selectedAdIds.size === 0 || !scheduledDate || !scheduledTime) return;
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    createMut.mutate({ adIds: [...selectedAdIds], scheduledAt });
  }

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "var(--surface-0)" }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--surface-2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold leading-none" style={{ fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
              Scheduled Uploads
            </h2>
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Schedule ads to be sent to Meta at a specific time
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setSelectedAdIds(new Set()); setScheduledDate(""); setScheduledTime(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold rounded-md transition-colors"
            style={{ background: "#0099C6" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
          >
            <Plus className="w-3.5 h-3.5" /> Schedule Upload
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin mr-2" style={{ color: "#60A7C8" }} />
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</span>
          </div>
        ) : (jobs as ScheduledJob[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Calendar className="w-8 h-8 mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No scheduled uploads</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
              Schedule ads from the Queue to be sent to Meta at a specific time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(jobs as ScheduledJob[]).map((job) => {
              const cfg = statusConfig[job.status] || statusConfig.pending;
              const adIds = JSON.parse(job.adIds) as number[];
              return (
                <div key={job.id} className="rounded-lg p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-sm border"
                          style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
                        >
                          {job.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                          {job.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                          {job.status === "failed" && <AlertTriangle className="w-3 h-3" />}
                          {cfg.label}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {adIds.length} ad{adIds.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                          Scheduled: {formatDate(job.scheduledAt)}
                        </span>
                        {job.status === "pending" && (
                          <span className="flex items-center gap-1" style={{ color: "#f59e0b" }}>
                            <Clock className="w-3 h-3" />
                            In {timeUntil(job.scheduledAt)}
                          </span>
                        )}
                      </div>
                      {job.result && (
                        <div className="mt-2 text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-2)", color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {job.result}
                        </div>
                      )}
                    </div>
                    {job.status === "pending" && (
                      <button
                        onClick={() => setDeleteTarget({ id: job.id })}
                        className="p-1.5 rounded-sm transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <form
            onSubmit={handleCreate}
            className="w-full max-w-lg space-y-4 p-6 rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ fontSize: "15px", color: "var(--text-primary)" }}>Schedule Upload</h3>
              <button type="button" onClick={() => setShowCreate(false)} style={{ color: "var(--text-secondary)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                  Date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                  Time
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)" }}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                Select Ready Ads ({selectedAdIds.size} selected)
              </label>
              <div className="max-h-48 overflow-auto rounded-sm" style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)" }}>
                {(allAds as any[]).length === 0 ? (
                  <p className="px-3 py-4 text-[11px] text-center" style={{ color: "var(--text-muted)" }}>No ready ads to schedule.</p>
                ) : (
                  (allAds as any[]).map((ad) => (
                    <label
                      key={ad.id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
                      style={{ borderBottom: "1px solid var(--surface-2)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLLabelElement).style.background = "rgba(0,153,198,0.03)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLLabelElement).style.background = ""; }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAdIds.has(ad.id)}
                        onChange={() => {
                          setSelectedAdIds(prev => {
                            const next = new Set(prev);
                            if (next.has(ad.id)) next.delete(ad.id);
                            else next.add(ad.id);
                            return next;
                          });
                        }}
                        className="accent-[#0099C6]"
                      />
                      <span className="text-[11px] truncate" style={{ color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {ad.adName || ad.conceptKey || `Ad #${ad.id}`}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button
                type="submit"
                disabled={selectedAdIds.size === 0 || !scheduledDate || !scheduledTime || createMut.isPending}
                className="px-4 py-2 text-white text-sm font-medium rounded-md transition-colors"
                style={{ background: "#0099C6", opacity: selectedAdIds.size === 0 ? 0.5 : 1 }}
              >
                {createMut.isPending ? "Scheduling…" : "Schedule"}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Cancel scheduled upload?"
        message="This scheduled upload will be cancelled. The ads will remain in the Ready state."
        confirmLabel="Cancel Upload"
        variant="warning"
        onConfirm={() => { if (deleteTarget) cancelMut.mutate({ id: deleteTarget.id }); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
