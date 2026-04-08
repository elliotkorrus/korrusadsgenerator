import { useState, useEffect, useRef } from "react";
import { CloudUpload, CheckCircle2, XCircle } from "lucide-react";
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
    const maxFrames = 180; // ~3 seconds at 60fps
    let raf: number;

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.vy += 0.08; // gravity
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

export default function UploadOverlay({ progress, active }: UploadOverlayProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const [visible, setVisible] = useState(false);
  const prevActiveRef = useRef(false);

  // Show overlay when active
  useEffect(() => {
    if (active) {
      setVisible(true);
      setShowCelebration(false);
    }
  }, [active]);

  // Detect completion: was active, now all done
  useEffect(() => {
    if (prevActiveRef.current && !active && progress.length > 0) {
      const allDone = progress.every((p) => p.stage === "done" || p.stage === "error");
      const anySuccess = progress.some((p) => p.stage === "done");
      if (allDone && anySuccess) {
        setShowCelebration(true);
        setTimeout(() => {
          setShowCelebration(false);
          setVisible(false);
        }, 3500);
      } else {
        // All failed
        setTimeout(() => setVisible(false), 2000);
      }
    }
    prevActiveRef.current = active;
  }, [active, progress]);

  if (!visible || progress.length === 0) return null;

  const done = progress.filter((p) => p.stage === "done").length;
  const failed = progress.filter((p) => p.stage === "error").length;
  const total = progress.length;
  const inProgress = total - done - failed;
  const overallPct = total > 0 ? Math.round(((done + failed) / total) * 100) : 0;

  // Current uploading item
  const current = progress.find(
    (p) => p.stage !== "done" && p.stage !== "error"
  );

  const allComplete = inProgress === 0;

  return (
    <>
      {showCelebration && <Confetti />}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          width: "min(480px, 90vw)",
          background: "var(--surface-1)",
          border: `1px solid ${allComplete ? (failed > 0 ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)") : "rgba(0,153,198,0.4)"}`,
          borderRadius: 12,
          padding: "16px 20px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          animation: "upload-overlay-in 0.3s ease-out",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {allComplete ? (
            failed > 0 ? (
              <XCircle size={20} style={{ color: "#ef4444" }} />
            ) : (
              <CheckCircle2 size={20} style={{ color: "#22c55e" }} />
            )
          ) : (
            <CloudUpload size={20} style={{ color: "#0099C6" }} className="animate-pulse" />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {allComplete
                ? failed > 0
                  ? `Upload complete — ${done} succeeded, ${failed} failed`
                  : `All ${done} ad${done !== 1 ? "s" : ""} uploaded successfully!`
                : `Uploading to Meta…`}
            </div>
            {!allComplete && current && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {stageName(current.stage)} — {current.message}
              </div>
            )}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: allComplete ? (failed > 0 ? "#ef4444" : "#22c55e") : "#0099C6", fontFamily: "monospace" }}>
            {overallPct}%
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              transition: "width 0.5s ease-out",
              width: `${overallPct}%`,
              background: allComplete
                ? failed > 0
                  ? "linear-gradient(90deg, #22c55e, #ef4444)"
                  : "#22c55e"
                : "linear-gradient(90deg, #0099C6, #60A7C8)",
            }}
          />
        </div>

        {/* Per-concept progress */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
          {progress.map((p) => (
            <div
              key={p.conceptKey}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: p.stage === "done" ? "#22c55e" : p.stage === "error" ? "#ef4444" : "#0099C6",
                animation: p.stage !== "done" && p.stage !== "error" ? "pulse 1.5s infinite" : "none",
              }} />
              <span style={{
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontFamily: "monospace",
                color: p.stage === "error" ? "#f87171" : "var(--text-muted)",
              }}>
                {p.adName || p.conceptKey}
              </span>
              <span style={{
                fontSize: 10, flexShrink: 0,
                color: p.stage === "done" ? "#22c55e" : p.stage === "error" ? "#f87171" : "#60A7C8",
              }}>
                {p.stage === "done" ? "✓" : p.stage === "error" ? "✕" : `${stageName(p.stage)}${p.chunkProgress > 0 ? ` ${p.chunkProgress}%` : ""}`}
              </span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes upload-overlay-in {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
