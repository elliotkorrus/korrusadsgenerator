import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // Focus confirm button when dialog opens
      setTimeout(() => confirmRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const colors = {
    danger: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)", text: "#ef4444", btnBg: "#dc2626" },
    warning: { bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.4)", text: "#eab308", btnBg: "#ca8a04" },
    default: { bg: "rgba(96,167,200,0.15)", border: "rgba(96,167,200,0.4)", text: "#60A7C8", btnBg: "#0099C6" },
  }[variant];

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="rounded-xl p-6 max-w-md w-full mx-4"
        style={{
          background: "var(--surface-1)",
          border: `1px solid ${colors.border}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-start gap-3">
          {variant !== "default" && (
            <div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: colors.bg }}
            >
              <AlertTriangle size={20} style={{ color: colors.text }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm">{title}</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-zinc-400" />
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-secondary)",
              border: "1px solid var(--surface-3)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-md transition-colors hover:opacity-90"
            style={{ background: colors.btnBg }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
