import { X, Keyboard } from "lucide-react";
import { SHORTCUT_MAP } from "../hooks/useKeyboardShortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl p-6 max-w-sm w-full mx-4"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--surface-3)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-zinc-400" />
            <h3 className="font-semibold text-white text-sm">Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X size={16} className="text-zinc-400" />
          </button>
        </div>

        <div className="space-y-1.5">
          {SHORTCUT_MAP.map((s) => (
            <div key={s.key + (s.shift ? "-shift" : "")} className="flex items-center justify-between py-1">
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {s.description}
              </span>
              <kbd
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--surface-3)",
                  color: "var(--text-muted)",
                }}
              >
                {s.shift ? "Shift+" : ""}{s.key === " " ? "Space" : s.key}
              </kbd>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Shortcuts are disabled when typing in input fields.
        </p>
      </div>
    </div>
  );
}
