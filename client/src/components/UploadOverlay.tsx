import { useState, useEffect, useRef } from "react";
import { CloudUpload, CheckCircle2, XCircle, Loader2, X, ChevronUp, ChevronDown } from "lucide-react";
import type { UploadProgress } from "../hooks/useUploadProgress";
import { stageName } from "../hooks/useUploadProgress";

interface UploadOverlayProps {
  progress: UploadProgress[];
  active: boolean;
}

// Confetti particle
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotSpeed: number;
}

const CONFETTI_COLORS = ["#0099C6", "#60A7C8", "#22c55e", "#eab308", "#f87171", "#a78bfa", "#38bdf8", "#fb923c"];

function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = [];
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 300,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 6,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }

    let frame = 0;
    const maxFrames = 180;
    let raf: number;

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.vy += 0.08;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      frame++;
      if (frame < maxFrames) {
        raf = requestAnimationFrame(animate);
      }
    }

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 10001, pointerEvents: "none" }}
    />
  );
}

// Stage step indicator
const STAGES = ["uploading_asset", "processing_video", "creating_creative", "creating_ad", "done"] as const;

function StageProgress({ stage, chunkProgress }: { stage: string; chunkProgress: number }) {
  const stageIdx = STAGES.indexOf(stage as any);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {STAGES.slice(0, -1).map((s, i) => {
        const isComplete = stageIdx > i || stage === "done";
        const isCurrent = stageIdx === i && stage !== "done" && stage !== "error";
        return (
          <div key={s} style={{ position: "relative", flex: 1, height: 3, borderRadius: 2, overflow: "hidden", background: "var(--surface-3)" }}>
            <div style={{
              height: "100%",
              borderRadius: 2,
              transition: "width 0.4s ease-out",
              width: isComplete ? "100%" : isCurrent ? `${Math.max(chunkProgress, 10)}%` : "0%",
              background: isComplete ? "#22c55e" : isCurrent ? "#0099C6" : "transparent",
            }} />
          </div>
        );
      })}
    </div>
  );
}

export default function UploadOverlay({ progress, active }: UploadOverlayProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const prevActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setShowCelebration(false);
      setExpanded(true);
    }
  }, [active]);

  useEffect(() => {
    if (prevActiveRef.current && !active && progress.length > 0) {
      const allDone = progress.every((p) => p.stage === "done" || p.stage === "error");
      const anySuccess = progress.some((p) => p.stage === "done");
      if (allDone && anySuccess) {
        setShowCelebration(true);
        setTimeout(() => {
          setShowCelebration(false);
          setVisible(false);
        }, 4000);
      } else {
        setTimeout(() => setVisible(false), 3000);
      }
    }
    prevActiveRef.current = active;
  }, [active, progress]);

  if (!visible || progress.length === 0) return null;

  const done = progress.filter((p) => p.stage === "done").length;
  const failed = progress.filter((p) => p.stage === "error").length;
  const total = progress.length;
  const inProgress = total - done - failed;
  const allComplete = inProgress === 0;

  const current = progress.find((p) => p.stage !== "done" && p.stage !== "error");

  // Overall progress: weight each concept equally, with stage-based sub-progress
  const overallPct = total > 0 ? Math.round(
    progress.reduce((sum, p) => {
      if (p.stage === "done") return sum + 100;
      if (p.stage === "error") return sum + 100;
      const idx = STAGES.indexOf(p.stage as any);
      const stagePct = idx >= 0 ? (idx / (STAGES.length - 1)) * 100 : 0;
      const chunkBonus = p.chunkProgress > 0 ? (p.chunkProgress / (STAGES.length - 1)) : 0;
      return sum + stagePct + chunkBonus;
    }, 0) / total
  ) : 0;

  return (
    <>
      {showCelebration && <Confetti />}
      <div style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 10000,
        width: expanded ? "min(420px, calc(100vw - 48px))" : 280,
        transition: "width 0.3s ease",
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}>
        <div style={{
          background: "var(--surface-1)",
          border: `1px solid ${allComplete ? (failed > 0 ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)") : "rgba(0,153,198,0.3)"}`,
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,153,198,0.08)",
          overflow: "hidden",
          animation: "upload-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          {/* Header bar */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
              cursor: "pointer",
              background: allComplete
                ? failed > 0 ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)"
                : "rgba(0,153,198,0.06)",
            }}
            onClick={() => setExpanded(v => !v)}
          >
            {/* Icon */}
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: allComplete
                ? failed > 0 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)"
                : "rgba(0,153,198,0.12)",
            }}>
              {allComplete ? (
                failed > 0 ? <XCircle size={16} style={{ color: "#ef4444" }} />
                  : <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
              ) : (
                <Loader2 size={16} style={{ color: "#0099C6" }} className="animate-spin" />
              )}
            </div>

            {/* Title */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                {allComplete
                  ? failed > 0
                    ? `${done} uploaded, ${failed} failed`
                    : `${done} ad${done !== 1 ? "s" : ""} uploaded!`
                  : "Uploading to Meta"}
              </div>
              {!allComplete && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                  {done}/{total} complete
                  {current ? ` · ${stageName(current.stage)}` : ""}
                </div>
              )}
            </div>

            {/* Percentage + collapse */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 18, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
                color: allComplete ? (failed > 0 ? "#ef4444" : "#22c55e") : "#0099C6",
              }}>
                {overallPct}%
              </span>
              {expanded ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: "var(--surface-3)" }}>
            <div style={{
              height: "100%",
              transition: "width 0.5s ease-out",
              width: `${overallPct}%`,
              background: allComplete
                ? failed > 0
                  ? "linear-gradient(90deg, #22c55e, #ef4444)"
                  : "#22c55e"
                : "linear-gradient(90deg, #0099C6, #60A7C8)",
            }} />
          </div>

          {/* Expanded detail */}
          {expanded && (
            <div style={{
              padding: "10px 16px 14px",
              maxHeight: 300,
              overflowY: "auto",
            }}>
              {progress.map((p) => {
                const isDone = p.stage === "done";
                const isError = p.stage === "error";
                const isActive = !isDone && !isError;

                return (
                  <div
                    key={p.conceptKey}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--surface-2)",
                    }}
                  >
                    {/* Status icon */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isDone ? "rgba(34,197,94,0.12)" : isError ? "rgba(239,68,68,0.12)" : "rgba(0,153,198,0.08)",
                    }}>
                      {isDone && <CheckCircle2 size={12} style={{ color: "#22c55e" }} />}
                      {isError && <XCircle size={12} style={{ color: "#ef4444" }} />}
                      {isActive && <Loader2 size={12} style={{ color: "#0099C6" }} className="animate-spin" />}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        color: isError ? "#f87171" : "var(--text-primary)",
                      }}>
                        {p.adName || p.conceptKey}
                      </div>
                      {isActive && (
                        <div style={{ marginTop: 4 }}>
                          <StageProgress stage={p.stage} chunkProgress={p.chunkProgress} />
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                            {p.message}
                          </div>
                        </div>
                      )}
                      {isError && p.message && (
                        <div style={{ fontSize: 9, color: "#f87171", marginTop: 2 }}>
                          {p.message}
                        </div>
                      )}
                    </div>

                    {/* Right badge */}
                    <div style={{
                      flexShrink: 0, fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                      background: isDone ? "rgba(34,197,94,0.1)" : isError ? "rgba(239,68,68,0.1)" : "rgba(0,153,198,0.1)",
                      color: isDone ? "#22c55e" : isError ? "#ef4444" : "#60A7C8",
                    }}>
                      {isDone ? "Done" : isError ? "Failed" : `${stageName(p.stage)}${p.chunkProgress > 0 ? ` ${p.chunkProgress}%` : ""}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes upload-slide-in {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
