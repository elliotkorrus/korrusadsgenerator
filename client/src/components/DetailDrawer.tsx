import React, { useEffect, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import { generateAdName } from "@shared/naming";

type QueueItem = {
  id: number;
  brand: string;
  initiative: string;
  variation: string;
  angle: string;
  source: string;
  product: string;
  contentType: string;
  creativeType: string;
  dimensions: string;
  copySlug: string;
  filename: string;
  date: string;
  generatedAdName: string;
  adSetId: string | null;
  adSetName: string | null;
  destinationUrl: string | null;
  headline: string | null;
  bodyCopy: string | null;
  handle: string | null;
  cta: string | null;
  displayUrl: string | null;
  agency: string | null;
  pageId: string | null;
  instagramAccountId: string | null;
  fileUrl: string | null;
  fileKey: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  status: "draft" | "ready" | "uploading" | "uploaded" | "error";
  metaAdId: string | null;
  metaCreativeId: string | null;
  errorMessage: string | null;
  uploadedAt: string | null;
  conceptKey: string | null;
};

type MetaDefaults = {
  pageId?: string | null;
  instagramUserId?: string | null;
  defaultDestinationUrl?: string | null;
  defaultDisplayUrl?: string | null;
  defaultCta?: string | null;
} | null | undefined;

interface DetailDrawerProps {
  item: QueueItem;
  fieldOptions: Record<string, { value: string; label: string }[]>;
  copyEntries: { copySlug: string; headline: string; bodyCopy: string; status: string }[];
  onUpdate: (id: number, updates: Record<string, any>) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  metaDefaults?: MetaDefaults;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "rgba(139,148,158,0.15)", text: "var(--text-muted)" },
  ready: { bg: "rgba(0,153,198,0.12)", text: "#0099C6" },
  uploading: { bg: "rgba(0,153,198,0.12)", text: "#0099C6" },
  uploaded: { bg: "rgba(46,160,67,0.12)", text: "#2ea043" },
  error: { bg: "rgba(218,54,51,0.12)", text: "#da3633" },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["ready"],
  ready: ["draft"],
  uploading: [],
  uploaded: ["draft"],
  error: ["draft", "ready"],
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  fontWeight: 600,
  marginBottom: "4px",
};

const inputStyle: React.CSSProperties = {
  background: "var(--surface-0)",
  border: "1px solid var(--surface-3)",
  color: "var(--text-primary)",
  borderRadius: "3px",
  padding: "6px 10px",
  fontSize: "13px",
  width: "100%",
  fontFamily: "inherit",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  paddingRight: "28px",
};

export default function DetailDrawer({
  item,
  fieldOptions,
  copyEntries,
  onUpdate,
  onDelete,
  onClose,
  metaDefaults,
}: DetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleFieldChange(field: string, value: string) {
    onUpdate(item.id, { [field]: value });
  }

  function handleStatusChange(newStatus: string) {
    onUpdate(item.id, { status: newStatus });
  }

  // Build live ad name preview from current fields
  const adNamePreview = generateAdName({
    handle: item.handle || "korruscircadian",
    brand: item.brand,
    initiative: item.initiative,
    variation: item.variation,
    angle: item.angle,
    source: item.source,
    product: item.product,
    contentType: item.contentType,
    creativeType: item.creativeType,
    dimensions: item.dimensions,
    copySlug: item.copySlug,
    filename: item.filename,
    date: item.date,
  });

  const isVideo = item.fileMimeType?.startsWith("video/") ||
    item.fileUrl?.match(/\.(mp4|mov|webm|avi)$/i);

  const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.draft;
  const transitions = STATUS_TRANSITIONS[item.status] || [];

  function renderSelect(
    field: string,
    optionsKey: string,
    value: string,
    disabled = false
  ) {
    const options = fieldOptions[optionsKey] || [];
    return (
      <select
        style={{
          ...selectStyle,
          ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
        }}
        value={value}
        disabled={disabled}
        onChange={(e) => handleFieldChange(field, e.target.value)}
        onFocus={(e) => {
          (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)";
        }}
        onBlur={(e) => {
          (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)";
        }}
      >
        <option value="">--</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  function renderTextInput(field: string, value: string, disabled = false, placeholder?: string) {
    return (
      <input
        type="text"
        style={{
          ...inputStyle,
          ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
        }}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => handleFieldChange(field, e.target.value)}
        onFocus={(e) => {
          (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)";
        }}
        onBlur={(e) => {
          (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)";
        }}
      />
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.25)",
          zIndex: 49,
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "420px",
          maxWidth: "100vw",
          background: "var(--surface-1)",
          zIndex: 50,
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 200ms ease forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--surface-2)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Ad Details
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "18px",
          }}
        >
          {/* Preview */}
          {item.fileUrl && (
            <div
              style={{
                marginBottom: "16px",
                borderRadius: "4px",
                overflow: "hidden",
                border: "1px solid var(--surface-2)",
                background: "var(--surface-0)",
              }}
            >
              {isVideo ? (
                <video
                  src={item.fileUrl}
                  controls
                  muted
                  style={{
                    width: "100%",
                    maxHeight: "240px",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              ) : (
                <img
                  src={item.fileUrl}
                  alt="Ad creative preview"
                  style={{
                    width: "100%",
                    maxHeight: "240px",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              )}
            </div>
          )}

          {/* Generated ad name preview */}
          <div style={{ marginBottom: "16px" }}>
            <div style={labelStyle}>Generated Ad Name</div>
            <div
              style={{
                fontSize: "11px",
                fontFamily: "'IBM Plex Mono', monospace",
                color: "var(--text-secondary)",
                background: "var(--surface-0)",
                border: "1px solid var(--surface-2)",
                borderRadius: "3px",
                padding: "8px 10px",
                wordBreak: "break-all",
                lineHeight: 1.5,
              }}
            >
              {adNamePreview || <span style={{ color: "var(--text-muted)" }}>Fill in fields to generate name</span>}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--surface-2)", marginBottom: "16px" }} />

          {/* Status */}
          <div style={{ marginBottom: "16px" }}>
            <div style={labelStyle}>Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "3px 10px",
                  borderRadius: "3px",
                  background: statusColor.bg,
                  color: statusColor.text,
                }}
              >
                {item.status}
              </span>
              {transitions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    padding: "3px 10px",
                    borderRadius: "3px",
                    border: "1px solid var(--surface-3)",
                    background: "var(--surface-0)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,153,198,0.5)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#0099C6";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--surface-3)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                  }}
                >
                  Move to {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--surface-2)", marginBottom: "16px" }} />

          {/* Form fields */}
          {/* Row 1: Handle + Product */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={labelStyle}>Handle</div>
              {renderTextInput("handle", item.handle || "korruscircadian")}
            </div>
            <div>
              <div style={labelStyle}>Product</div>
              {renderSelect("product", "product", item.product)}
            </div>
          </div>

          {/* Row 2: Initiative + Variation */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={labelStyle}>Initiative</div>
              {renderTextInput("initiative", item.initiative)}
            </div>
            <div>
              <div style={labelStyle}>Variation</div>
              {renderTextInput("variation", item.variation)}
            </div>
          </div>

          {/* Row 3: Theme + Creative Style */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={labelStyle}>Theme</div>
              {renderSelect("angle", "angle", item.angle)}
            </div>
            <div>
              <div style={labelStyle}>Creative Style</div>
              {renderSelect("creativeType", "creativeType", item.creativeType)}
            </div>
          </div>

          {/* Row 4: Producer + Ad Format */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={labelStyle}>Producer</div>
              {renderSelect("source", "source", item.source)}
            </div>
            <div>
              <div style={labelStyle}>Ad Format</div>
              {renderSelect("contentType", "contentType", item.contentType)}
            </div>
          </div>

          {/* Row 5: Dimensions + Copy Slug */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={labelStyle}>Dimensions</div>
              {renderSelect("dimensions", "dimensions", item.dimensions)}
            </div>
            <div>
              <div style={labelStyle}>Copy Slug</div>
              <select
                style={selectStyle}
                value={item.copySlug}
                onChange={(e) => handleFieldChange("copySlug", e.target.value)}
                onFocus={(e) => {
                  (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)";
                }}
                onBlur={(e) => {
                  (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)";
                }}
              >
                <option value="">--</option>
                {copyEntries.map((c) => (
                  <option key={c.copySlug} value={c.copySlug}>
                    {c.copySlug}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 6: Date + Agency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={labelStyle}>Date</div>
              {renderTextInput("date", item.date)}
            </div>
            <div>
              <div style={labelStyle}>Agency</div>
              {renderTextInput("agency", item.agency || "")}
            </div>
          </div>

          {/* Row 7: Filename (full width) */}
          <div style={{ marginBottom: "16px" }}>
            <div style={labelStyle}>Filename</div>
            {renderTextInput("filename", item.filename)}
          </div>

          <div style={{ borderTop: "1px solid var(--surface-2)", marginBottom: "16px" }} />

          {/* Meta Overrides */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-secondary)",
              marginBottom: "12px",
            }}>
              Meta Overrides
            </div>

            {/* Ad Set ID + Ad Set Name */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <div style={labelStyle}>Ad Set ID</div>
                {renderTextInput("adSetId", item.adSetId || "")}
              </div>
              <div>
                <div style={labelStyle}>Ad Set Name</div>
                {renderTextInput("adSetName", item.adSetName || "")}
              </div>
            </div>

            {/* Destination URL (full width) */}
            <div style={{ marginBottom: "12px" }}>
              <div style={labelStyle}>Destination URL</div>
              {renderTextInput("destinationUrl", item.destinationUrl || "", false, metaDefaults?.defaultDestinationUrl || "Default from Meta Settings")}
            </div>

            {/* CTA + Display Link */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <div style={labelStyle}>CTA</div>
                <select
                  style={selectStyle}
                  value={item.cta || ""}
                  onChange={(e) => handleFieldChange("cta", e.target.value)}
                  onFocus={(e) => {
                    (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)";
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)";
                  }}
                >
                  <option value="">{metaDefaults?.defaultCta ? `Default: ${metaDefaults.defaultCta}` : "--"}</option>
                  {["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE", "DOWNLOAD", "GET_OFFER", "ORDER_NOW", "BOOK_NOW", "CONTACT_US"].map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={labelStyle}>Display Link</div>
                {renderTextInput("displayUrl", item.displayUrl || "", false, metaDefaults?.defaultDisplayUrl || "Default from Meta Settings")}
              </div>
            </div>

            {/* Facebook Page ID + Instagram Account ID */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <div style={labelStyle}>Facebook Page ID</div>
                {renderTextInput("pageId", item.pageId || "", false, metaDefaults?.pageId || "Default from Meta Settings")}
              </div>
              <div>
                <div style={labelStyle}>Instagram Account ID</div>
                {renderTextInput("instagramAccountId", item.instagramAccountId || "", false, metaDefaults?.instagramUserId || "Default from Meta Settings")}
              </div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--surface-2)", marginBottom: "16px" }} />

          {/* Delete */}
          <button
            onClick={() => onDelete(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 500,
              padding: "7px 14px",
              borderRadius: "4px",
              border: "1px solid rgba(218,54,51,0.3)",
              background: "rgba(218,54,51,0.06)",
              color: "#da3633",
              cursor: "pointer",
              fontFamily: "inherit",
              width: "100%",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(218,54,51,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(218,54,51,0.06)";
            }}
          >
            <Trash2 size={13} />
            Delete Ad
          </button>
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
