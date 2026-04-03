import { useEffect, useRef } from "react";
import { X, AlertTriangle } from "lucide-react";

interface ValidationError {
  conceptKey: string;
  adName: string;
  missingFields: string[];
}

interface ValidationErrorModalProps {
  errors: ValidationError[];
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  adSetId: "Ad Set",
  headline: "Headline",
  bodyCopy: "Body Copy",
  destinationUrl: "Destination URL",
  fileUrl: "Creative File",
  pageId: "Facebook Page",
  instagramAccountId: "Instagram Account",
};

function humanFieldName(field: string): string {
  return FIELD_LABELS[field] || field;
}

export default function ValidationErrorModal({ errors, onClose }: ValidationErrorModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate in on mount
    requestAnimationFrame(() => {
      if (backdropRef.current) backdropRef.current.style.opacity = "1";
      if (panelRef.current) {
        panelRef.current.style.opacity = "1";
        panelRef.current.style.transform = "scale(1) translateY(0)";
      }
    });
  }, []);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.6)",
        opacity: 0,
        transition: "opacity 0.2s ease-out",
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: "#1e2128",
          border: "1px solid rgba(255,255,255,0.08)",
          opacity: 0,
          transform: "scale(0.95) translateY(10px)",
          transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">
              Missing Fields — Cannot Upload
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-gray-400 mb-4">
            The following ads are missing required fields. Fix these before sending to Meta.
          </p>

          <div className="space-y-3">
            {errors.map((err) => (
              <div
                key={err.conceptKey}
                className="rounded-lg p-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="text-xs font-medium text-white mb-2 truncate" title={err.adName}>
                  {err.adName}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {err.missingFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
                      style={{
                        background: "rgba(245,158,11,0.12)",
                        color: "#fbbf24",
                        border: "1px solid rgba(245,158,11,0.2)",
                      }}
                    >
                      {humanFieldName(field)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-end" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-md transition-colors"
            style={{ background: "rgba(255,255,255,0.08)", color: "white" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
