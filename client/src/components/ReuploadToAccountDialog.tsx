// Migration dialog: re-upload selected `uploaded` ads into a different
// Meta ad account + ad set. Mirrors the duplicate-with-URL pattern —
// fires a POST that kicks a background job, then polls /status for
// progress until done.
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import AdSetPicker from "./AdSetPicker";

interface ReuploadToAccountDialogProps {
  sourceAdIds: number[];   // queue row IDs (status="uploaded") to re-upload
  onClose: () => void;
  onComplete?: () => void; // fires once the background job finishes
}

interface JobStatus {
  active: boolean;
  total?: number;
  completed?: number;
  success?: number;
  failed?: number;
  done?: boolean;
  errors?: Array<{ sourceAdIds: number[]; error: string }>;
  elapsedMs?: number;
}

export default function ReuploadToAccountDialog({ sourceAdIds, onClose, onComplete }: ReuploadToAccountDialogProps) {
  const settingsQ = trpc.meta.get.useQuery();
  const targetAccountId = settingsQ.data?.secondaryAdAccountId || "";

  const [targetAdSetId, setTargetAdSetId] = useState("");
  const [targetAdSetName, setTargetAdSetName] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [polling, setPolling] = useState(false);

  // Poll the status endpoint while a job is running.
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/reupload-to-account/status");
        const data: JobStatus = await res.json();
        if (cancelled) return;
        setStatus(data);
        if (data.done) {
          setPolling(false);
          if (onComplete) onComplete();
        }
      } catch {
        // network blip — keep trying
      }
    };
    tick();
    const interval = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [polling, onComplete]);

  const canStart = useMemo(() => {
    return !!targetAccountId && !!targetAdSetId && !polling && !(status?.done);
  }, [targetAccountId, targetAdSetId, polling, status]);

  async function handleStart() {
    if (!canStart) return;
    setStartError(null);
    try {
      const token = localStorage.getItem("app-token");
      const res = await fetch("/api/reupload-to-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-app-token": token } : {}),
        },
        body: JSON.stringify({
          sourceAdIds,
          targetAdAccountId: targetAccountId,
          targetAdSetId,
          targetAdSetName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStartError(data.error || `Request failed: ${res.status}`);
        return;
      }
      setStatus({ active: true, total: sourceAdIds.length, completed: 0, success: 0, failed: 0, done: false });
      setPolling(true);
    } catch (err: any) {
      setStartError(err.message || "Failed to start re-upload");
    }
  }

  const isRunning = polling && !(status?.done);
  const isDone = !!status?.done;
  const completed = status?.completed ?? 0;
  const total = status?.total ?? sourceAdIds.length;
  const success = status?.success ?? 0;
  const failed = status?.failed ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !isRunning) onClose(); }}
    >
      <div
        className="rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--surface-3)" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Re-upload to new account
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {sourceAdIds.length} ad{sourceAdIds.length === 1 ? "" : "s"} selected
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--text-muted)" }}
            title={isRunning ? "Wait for job to finish before closing" : "Close"}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Target account */}
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              Target account
            </label>
            {settingsQ.isLoading ? (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Loading…</div>
            ) : !targetAccountId ? (
              <div
                className="flex items-start gap-2 text-xs rounded p-2"
                style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)", color: "#fb923c" }}
              >
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  No secondary ad account is set. Have an admin set <code>secondary_ad_account_id</code> in Meta Settings before using this.
                </span>
              </div>
            ) : (
              <div className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                {targetAccountId}
              </div>
            )}
          </div>

          {/* Target ad set */}
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              Target ad set
            </label>
            {targetAccountId ? (
              <AdSetPicker
                value={targetAdSetId}
                displayValue={targetAdSetName}
                onSelect={(id, name) => { setTargetAdSetId(id); setTargetAdSetName(name); }}
                accountId={targetAccountId}
              />
            ) : (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>—</div>
            )}
            <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
              All {sourceAdIds.length} selected ad{sourceAdIds.length === 1 ? "" : "s"} will be created in this ad set.
            </p>
          </div>

          {/* Start error */}
          {startError && (
            <div
              className="flex items-start gap-2 text-xs rounded p-2"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
            >
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{startError}</span>
            </div>
          )}

          {/* Progress */}
          {status && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-secondary)" }}>
                  {isDone ? "Done" : "Uploading…"} {completed}/{total}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {success} ok · {failed} failed
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: failed > 0 && isDone ? "#fb923c" : "#22c55e",
                  }}
                />
              </div>
              {isDone && failed === 0 && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#22c55e" }}>
                  <CheckCircle2 size={13} />
                  All {success} re-uploaded successfully
                </div>
              )}
              {isDone && failed > 0 && status.errors && status.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto text-[10px] space-y-1 rounded p-2" style={{ background: "var(--surface-2)" }}>
                  {status.errors.slice(0, 10).map((e, i) => (
                    <div key={i} style={{ color: "#f87171" }}>
                      <span className="font-mono">#{e.sourceAdIds.join(",")}</span>: {e.error}
                    </div>
                  ))}
                  {status.errors.length > 10 && (
                    <div style={{ color: "var(--text-muted)" }}>
                      …and {status.errors.length - 10} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--surface-3)" }}>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "transparent", border: "1px solid var(--surface-3)", color: "var(--text-secondary)" }}
          >
            {isDone ? "Close" : "Cancel"}
          </button>
          {!isDone && (
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="px-3 py-1.5 text-xs font-semibold rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#0099C6", color: "white", border: "1px solid #0099C6" }}
            >
              {isRunning ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Uploading…
                </span>
              ) : (
                `Re-upload ${sourceAdIds.length} ad${sourceAdIds.length === 1 ? "" : "s"}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
