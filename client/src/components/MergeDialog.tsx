import { useState } from "react";
import { X, GitMerge, CheckCircle2 } from "lucide-react";

type ConceptGroup = {
  key: string;
  rows: Array<{
    id: number;
    dimensions: string;
    generatedAdName: string;
    brand: string;
    initiative: string;
    variation: string;
    angle: string;
    source: string;
    product: string;
    contentType: string;
    creativeType: string;
    copySlug: string;
    filename: string;
    date: string;
    status: string;
    conceptKey: string | null;
  }>;
  shared: {
    generatedAdName: string;
    brand: string;
    initiative: string;
    variation: string;
    angle: string;
    source: string;
    product: string;
    contentType: string;
    creativeType: string;
    copySlug: string;
    filename: string;
    date: string;
  };
};

interface MergeDialogProps {
  groups: ConceptGroup[];
  onConfirm: (primaryConceptKey: string, secondaryConceptKeys: string[]) => void;
  onClose: () => void;
  isLoading?: boolean;
}

const DIM_COLORS: Record<string, string> = {
  "9:16": "bg-violet-500/10 text-violet-300 border-violet-500/20",
  "4:5": "bg-sky-500/10 text-sky-300 border-sky-500/20",
  "1:1": "bg-teal-500/10 text-teal-300 border-teal-500/20",
  "16:9": "bg-amber-500/10 text-amber-300 border-amber-500/20",
};

function DimBadge({ dim }: { dim: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-bold rounded-sm border ${
        DIM_COLORS[dim] ?? "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"
      }`}
    >
      {dim}
    </span>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span style={{ color: "var(--text-muted)", minWidth: 60 }}>{label}</span>
      <span
        className="font-mono px-1 py-0.5 rounded-sm"
        style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function MergeDialog({ groups, onConfirm, onClose, isLoading }: MergeDialogProps) {
  const [primaryKey, setPrimaryKey] = useState<string>(groups[0]?.key ?? "");

  function handleConfirm() {
    const secondaryKeys = groups.map((g) => g.key).filter((k) => k !== primaryKey);
    onConfirm(primaryKey, secondaryKeys);
  }

  const primaryGroup = groups.find((g) => g.key === primaryKey);
  const secondaryCount = groups.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
        style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--surface-3)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(96,167,200,0.12)", border: "1px solid rgba(96,167,200,0.2)" }}
            >
              <GitMerge className="w-4 h-4" style={{ color: "#60A7C8" }} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                Merge Concepts
              </h2>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Pick the primary — all others will inherit its naming fields
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--text-muted)", border: "none", background: "transparent", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Group list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {groups.map((group) => {
            const isPrimary = group.key === primaryKey;
            return (
              <button
                key={group.key}
                onClick={() => setPrimaryKey(group.key)}
                className="w-full text-left rounded-lg p-3.5 transition-all"
                style={{
                  background: isPrimary ? "rgba(0,153,198,0.07)" : "var(--surface-2)",
                  border: `1.5px solid ${isPrimary ? "rgba(0,153,198,0.4)" : "var(--surface-3)"}`,
                  cursor: "pointer",
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Radio */}
                  <div
                    className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{
                      border: `1.5px solid ${isPrimary ? "#0099C6" : "var(--surface-3)"}`,
                      background: isPrimary ? "#0099C6" : "transparent",
                    }}
                  >
                    {isPrimary && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Badge row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPrimary && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded-sm border"
                          style={{ background: "rgba(0,153,198,0.12)", color: "#60A7C8", borderColor: "rgba(0,153,198,0.25)" }}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" /> PRIMARY
                        </span>
                      )}
                      {!isPrimary && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-sm border"
                          style={{ background: "var(--surface-3)", color: "var(--text-muted)", borderColor: "var(--surface-3)" }}
                        >
                          MERGE INTO PRIMARY
                        </span>
                      )}
                      {group.rows.map((r) => (
                        <DimBadge key={r.id} dim={r.dimensions} />
                      ))}
                    </div>

                    {/* Ad name */}
                    <p
                      className="font-mono text-[10px] break-all leading-relaxed"
                      style={{ color: isPrimary ? "var(--text-primary)" : "var(--text-secondary)" }}
                    >
                      {group.shared.generatedAdName}
                    </p>

                    {/* Key fields */}
                    <div className="space-y-1">
                      <FieldRow label="Initiative" value={group.shared.initiative} />
                      <FieldRow label="Angle" value={group.shared.angle} />
                      <FieldRow label="Source" value={group.shared.source} />
                      <FieldRow label="Copy" value={group.shared.copySlug} />
                      <FieldRow label="Filename" value={group.shared.filename} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Summary + actions */}
        <div
          className="flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid var(--surface-3)", background: "var(--surface-2)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {secondaryCount} concept{secondaryCount !== 1 ? "s" : ""} will be merged into{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              {primaryGroup?.shared.filename || primaryGroup?.key}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors"
              style={{ background: "transparent", border: "1px solid var(--surface-3)", color: "var(--text-secondary)", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--surface-3)")}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md flex items-center gap-1.5 transition-all"
              style={{
                background: isLoading ? "rgba(0,153,198,0.4)" : "linear-gradient(135deg, #0099C6, #255C9E)",
                color: "white",
                border: "none",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              <GitMerge className="w-3.5 h-3.5" />
              {isLoading ? "Merging…" : "Merge Concepts"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
