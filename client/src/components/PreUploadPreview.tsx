import { useMemo } from "react";
import { CloudUpload, X, AlertTriangle, ExternalLink, Image, Film } from "lucide-react";

interface AdItem {
  id: number;
  generatedAdName: string;
  adSetId: string | null;
  adSetName: string | null;
  headline: string | null;
  bodyCopy: string | null;
  destinationUrl: string | null;
  displayUrl: string | null;
  cta: string | null;
  copySlug: string | null;
  fileUrl: string | null;
  dimensions: string;
  contentType: string;
  conceptKey: string | null;
  status: string;
  handle: string | null;
}

interface MetaDefaults {
  defaultDestinationUrl?: string | null;
  defaultDisplayUrl?: string | null;
  defaultCta?: string | null;
  utmTemplate?: string | null;
  pageId?: string | null;
  instagramUserId?: string | null;
}

interface PreUploadPreviewProps {
  ads: AdItem[];
  metaDefaults: MetaDefaults | null;
  adSets?: Array<{ id: string; name: string; campaignName?: string }>;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

interface ConceptGroup {
  conceptKey: string;
  adName: string;
  ads: AdItem[];
  adSetName: string | null;
  adSetId: string | null;
  headline: string | null;
  bodyCopy: string | null;
  destinationUrl: string;
  cta: string;
  dimensions: string[];
  warnings: string[];
}

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: "Shop Now",
  LEARN_MORE: "Learn More",
  SIGN_UP: "Sign Up",
  BUY_NOW: "Buy Now",
  ORDER_NOW: "Order Now",
  GET_OFFER: "Get Offer",
};

export default function PreUploadPreview({ ads, metaDefaults, adSets, onConfirm, onCancel, loading }: PreUploadPreviewProps) {
  // Build a lookup for fresh ad set names from the API
  const adSetNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (adSets) {
      for (const s of adSets) {
        map.set(s.id, s.campaignName ? `${s.campaignName} → ${s.name}` : s.name);
      }
    }
    return map;
  }, [adSets]);

  const groups = useMemo(() => {
    const map = new Map<string, AdItem[]>();
    for (const ad of ads) {
      const key = ad.conceptKey || `solo_${ad.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ad);
    }

    const result: ConceptGroup[] = [];
    for (const [conceptKey, groupAds] of map) {
      const primary = groupAds[0];
      const destUrl = primary.destinationUrl || metaDefaults?.defaultDestinationUrl || "";
      const cta = primary.cta || metaDefaults?.defaultCta || "SHOP_NOW";
      const warnings: string[] = [];

      if (!primary.adSetId) warnings.push("No ad set assigned");
      if (!primary.headline && !primary.copySlug) warnings.push("No headline");
      if (!primary.bodyCopy && !primary.copySlug) warnings.push("No body copy");
      if (!destUrl) warnings.push("No destination URL");
      if (groupAds.some((a) => !a.fileUrl)) warnings.push("Missing creative file(s)");

      // Resolve fresh ad set name from API, fallback to stored name
      const resolvedAdSetName = primary.adSetId
        ? adSetNameMap.get(primary.adSetId) || primary.adSetName
        : primary.adSetName;

      result.push({
        conceptKey,
        adName: primary.generatedAdName,
        ads: groupAds,
        adSetName: resolvedAdSetName,
        adSetId: primary.adSetId,
        headline: primary.headline,
        bodyCopy: primary.bodyCopy,
        destinationUrl: destUrl,
        cta,
        dimensions: groupAds.map((a) => a.dimensions).filter(Boolean),
        warnings,
      });
    }
    return result;
  }, [ads, metaDefaults]);

  const hasWarnings = groups.some((g) => g.warnings.length > 0);
  const totalAds = ads.length;
  const totalConcepts = groups.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-1)",
          borderRadius: 12,
          border: "1px solid var(--surface-3)",
          width: "min(680px, 90vw)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--surface-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CloudUpload size={18} style={{ color: "#0099C6" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                Confirm Upload to Meta
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                {totalConcepts} concept{totalConcepts !== 1 ? "s" : ""} ({totalAds} ad variant{totalAds !== 1 ? "s" : ""}) will be created as PAUSED
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Concept list */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
          {groups.map((group, i) => (
            <div
              key={group.conceptKey}
              style={{
                background: "var(--surface-0)",
                borderRadius: 8,
                border: group.warnings.length > 0
                  ? "1px solid rgba(234,179,8,0.3)"
                  : "1px solid var(--surface-3)",
                padding: "12px 14px",
                marginBottom: i < groups.length - 1 ? 10 : 0,
              }}
            >
              {/* Ad Name */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                }}
              >
                {group.adName}
              </div>

              {/* Details grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "4px 12px",
                  marginTop: 8,
                  fontSize: 11,
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Ad Set</span>
                <span style={{ color: group.adSetName ? "var(--text-primary)" : "#ef4444" }}>
                  {group.adSetName || group.adSetId || "Not assigned"}
                </span>

                <span style={{ color: "var(--text-muted)" }}>Headline</span>
                <span style={{ color: group.headline ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {group.headline || (group.ads[0].copySlug ? `via ${group.ads[0].copySlug}` : "—")}
                </span>

                <span style={{ color: "var(--text-muted)" }}>Body</span>
                <span
                  style={{
                    color: group.bodyCopy ? "var(--text-primary)" : "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.bodyCopy
                    ? group.bodyCopy.length > 80
                      ? group.bodyCopy.slice(0, 80) + "…"
                      : group.bodyCopy
                    : (group.ads[0].copySlug ? `via ${group.ads[0].copySlug}` : "—")}
                </span>

                <span style={{ color: "var(--text-muted)" }}>CTA</span>
                <span style={{ color: "var(--text-primary)" }}>
                  {CTA_LABELS[group.cta] || group.cta}
                </span>

                <span style={{ color: "var(--text-muted)" }}>Destination</span>
                <span
                  style={{
                    color: group.destinationUrl ? "#60A7C8" : "#ef4444",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.destinationUrl || "Not set"}
                </span>

                <span style={{ color: "var(--text-muted)" }}>Placements</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {group.dimensions.map((dim) => {
                    const isVideo = group.ads.find((a) => a.dimensions === dim)?.contentType === "VID";
                    return (
                      <span
                        key={dim}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--surface-2)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--surface-3)",
                        }}
                      >
                        {isVideo ? <Film size={9} /> : <Image size={9} />}
                        {dim}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Warnings */}
              {group.warnings.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {group.warnings.map((w) => (
                    <div
                      key={w}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 10,
                        color: "#eab308",
                      }}
                    >
                      <AlertTriangle size={10} />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* UTM info */}
        {metaDefaults?.utmTemplate && (
          <div
            style={{
              padding: "8px 20px",
              borderTop: "1px solid var(--surface-3)",
              fontSize: 10,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ExternalLink size={10} />
            <span>UTM tags will be appended from your template</span>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            padding: "14px 20px",
            borderTop: "1px solid var(--surface-3)",
          }}
        >
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--surface-3)",
              borderRadius: 6,
              padding: "7px 16px",
              fontSize: 12,
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: hasWarnings ? "#b45309" : "#0099C6",
              border: "none",
              borderRadius: 6,
              padding: "7px 20px",
              fontSize: 12,
              fontWeight: 600,
              color: "white",
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <CloudUpload size={14} />
            {loading ? "Uploading…" : hasWarnings ? "Upload Anyway" : "Confirm & Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
