// Clone live ads into a different ad set in the SAME account.
// Use case: copy a high-performing ad over to a new campaign that has a
// different objective (e.g. SALES → REACH), which Ads Manager's native
// copy/paste blocks. Reuses the existing /api/reupload-to-account async
// job — we just lock the target account to the primary one.
//
// The source ad is untouched: stays running, keeps its stats and ID.
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { trpc } from "../lib/trpc";
import AdSetPicker from "./AdSetPicker";

interface CloneToCampaignDialogProps {
  sourceAdIds: number[];
  onClose: () => void;
  onComplete?: () => void;
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

export default function CloneToCampaignDialog({ sourceAdIds, onClose, onComplete }: CloneToCampaignDialogProps) {
  const settingsQ = trpc.meta.get.useQuery();
  // Target account = source account (i.e. the primary ad account). The
  // existing reupload backend then takes care of recreating the creative
  // under whatever ad set we pick.
  const targetAccountId = settingsQ.data?.adAccountId || "";

  const [targetAdSetId, setTargetAdSetId] = useState("");
  const [targetAdSetName, setTargetAdSetName] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const token = localStorage.getItem("app-token");
        const res = await fetch("/api/reupload-to-account/status", {
          headers: token ? { "x-app-token": token } : {},
        });
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
      setStartError(err.message || "Failed to start clone");
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
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--surface-3)" }}>
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4" style={{ color: "#60A7C8" }} />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Clone to new campaign
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {sourceAdIds.length} ad{sourceAdIds.length === 1 ? "" : "s"} selected · source ads stay running
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--text-muted)" }}
            title={isRunning ? "Wait for job to finish before closing" : "Close"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {!isRunning && !isDone && (
            <>
              <div>
                <label className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>
                  Target ad set
                </label>
                <p className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Pick an ad set in your new campaign. Its objective will be inherited by the cloned ad.
                </p>
                <AdSetPicker
                  value={targetAdSetId}
                  displayValue={targetAdSetName}
                  onSelect={(id, name) => { setTargetAdSetId(id); setTargetAdSetName(name); }}
                />
              </div>

              <div className="text-[11px] flex items-start gap-2 px-3 py-2 rounded" style={{ background: "rgba(96,167,200,0.07)", border: "1px solid rgba(96,167,200,0.2)", color: "var(--text-secondary)" }}>
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#60A7C8" }} />
                <div>
                  <strong>Original ad stays untouched.</strong> We recreate the creative (same video/images, copy, CTA, URL) in the target ad set. Stats, learning, and budget on the source stay where they are.
                </div>
              </div>

              {startError && (
                <div className="text-[11px] flex items-start gap-2 px-3 py-2 rounded" style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.3)", color: "#fca5a5" }}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div>{startError}</div>
                </div>
              )}
            </>
          )}

          {(isRunning || isDone) && (
            <>
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#60A7C8" }} />
                ) : (
                  <CheckCircle2 className="w-4 h-4" style={{ color: failed > 0 ? "#fbbf24" : "#4ade80" }} />
                )}
                <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {isRunning ? "Cloning…" : failed > 0 ? "Done with errors" : "Cloned successfully"}
                </div>
                <div className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>
                  {completed}/{total} · {success} ✓ {failed > 0 ? `· ${failed} ✗` : ""}
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, background: failed > 0 ? "#fbbf24" : "#60A7C8" }}
                />
              </div>
              {status?.errors && status.errors.length > 0 && (
                <div className="text-[11px] mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {status.errors.map((e, i) => (
                    <div key={i} className="px-2 py-1 rounded" style={{ background: "rgba(248,113,113,0.08)", color: "#fca5a5" }}>
                      <span className="font-mono">ad {e.sourceAdIds.join(",")}</span>: {e.error}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

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
              className="px-3 py-1.5 text-xs font-semibold rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{ background: "linear-gradient(135deg, #60A7C8, #255C9E)", color: "white", border: "none" }}
            >
              <Copy className="w-3 h-3" />
              {isRunning ? "Cloning…" : `Clone ${sourceAdIds.length} ad${sourceAdIds.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
