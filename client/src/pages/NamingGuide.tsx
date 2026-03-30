import { useState } from "react";
import { Copy, Check } from "lucide-react";

const FIELDS = [
  {
    position: 1, key: "brand", label: "Brand", example: "OIO", color: "#60A7C8",
    description: "Always OIO. The ad-facing product brand.",
    rules: ["Always OIO — never KORRUS or anything else", "KORRUS is the company; OIO is the brand consumers see"],
    options: ["OIO"],
    fixed: true,
  },
  {
    position: 2, key: "initiative", label: "Initiative", example: "s_004", color: "#a78bfa",
    description: "Sprint or campaign bucket. Format: letter + underscore + zero-padded number.",
    rules: ["Lowercase letter(s) + underscore + 3-digit number", "s = sprint  ·  q = quarterly  ·  e = evergreen", "Increment per new campaign sprint"],
    options: [],
    fixed: false,
  },
  {
    position: 3, key: "variation", label: "Variation", example: "v1", color: "#34d399",
    description: "Creative variant within the same concept.",
    rules: ["v + number: v1, v2, v3…", "Same angle + copy = same variation number", "New creative direction → new variation number"],
    options: ["v1", "v2", "v3", "v4", "v5"],
    fixed: false,
  },
  {
    position: 4, key: "angle", label: "Angle", example: "RedditQ&A", color: "#f59e0b",
    description: "The marketing angle or hook. Comes from Angle Bank.",
    rules: ["No spaces — use CamelCase or hyphens", "Must match an entry in Angle Bank", "Describes the emotional/logical hook, not the format"],
    options: ["RedditQ&A", "SocialProof", "ProblemAgitate", "EducationFirst", "BeforeAfter"],
    fixed: false,
  },
  {
    position: 5, key: "source", label: "Source", example: "NG", color: "#fb923c",
    description: "Traffic source or creative origin.",
    rules: ["NG = No Growth (organic seeding)", "PAID = paid media", "UGC = user-generated content creator", "STUDIO = in-house studio", "STOCK = stock asset", "AI = AI-generated creative"],
    options: ["NG", "PAID", "UGC", "STUDIO", "STOCK", "AI"],
    fixed: false,
  },
  {
    position: 6, key: "product", label: "Product", example: "OIO", color: "#38bdf8",
    description: "Which product line this ad is for.",
    rules: ["OIO = OIO circadian bulb", "SERUM = future product line"],
    options: ["OIO", "SERUM"],
    fixed: false,
  },
  {
    position: 7, key: "contentType", label: "Format", example: "IMG", color: "#e879f9",
    description: "File format of the creative asset.",
    rules: ["IMG = static image (JPG, PNG, WEBP)", "VID = video (MP4, MOV)", "GIF = animated GIF", "CAR = carousel (multi-image)"],
    options: ["IMG", "VID", "GIF", "CAR"],
    fixed: false,
  },
  {
    position: 8, key: "creativeType", label: "Type", example: "ESTATIC", color: "#4ade80",
    description: "Creative execution style.",
    rules: ["ESTATIC = elevated static", "UGC = user-generated content style", "MEME = meme format", "GFX = motion graphics", "MASHUP = mixed media", "TESTI = testimonial", "AI = AI-generated imagery"],
    options: ["ESTATIC", "UGC", "MEME", "GFX", "MASHUP", "TESTI", "AI"],
    fixed: false,
  },
  {
    position: 9, key: "dimensions", label: "Dims", example: "1x1", color: "#94a3b8",
    description: "Ad placement dimensions. Auto-detected from image pixel size on drop.",
    rules: ["9x16 = vertical Stories / Reels", "1x1 = square Feed", "4x5 = portrait Feed", "16x9 = horizontal / landscape", "Colon replaced with x in the name (9:16 → 9x16)"],
    options: ["9x16", "1x1", "4x5", "16x9"],
    fixed: false,
  },
  {
    position: 10, key: "copySlug", label: "Copy", example: "RQA-SleepStruggles", color: "#f472b6",
    description: "Identifies the specific ad copy variant. Links to an entry in Copy Library.",
    rules: ["Must match a copy_slug in Copy Library", "Format: ANGLE-ShortDescriptor", "No spaces — use hyphens", "Required before marking an ad Ready"],
    options: ["RQA-SleepStruggles", "RQA-ReliableSetup", "RQA-CircadianDisorder", "RQA-TriedEveryBulb", "RQA-BlueLight"],
    fixed: false,
  },
  {
    position: 11, key: "filename", label: "Filename", example: "korrus_s_004_1_RedditQ&A_ng_2026-03", color: "#a3a3a3",
    description: "Source filename without extension and without the size token. Auto-parsed on drop.",
    rules: ["Stripped of file extension (.png, .mp4, etc.)", "Stripped of dimension token — size is in Dims field", "Preserves original filename structure for traceability"],
    options: [],
    fixed: false,
  },
  {
    position: 12, key: "date", label: "Date", example: "2026-03", color: "#71717a",
    description: "Month the creative was produced. Format: YYYY-MM.",
    rules: ["YYYY-MM format only — no day", "Auto-parsed from filename if present", "Defaults to current month on drop"],
    options: [],
    fixed: false,
  },
];

const DEFAULT_VALUES: Record<string, string> = {
  brand: "OIO", initiative: "s_004", variation: "v1", angle: "RedditQ&A",
  source: "NG", product: "OIO", contentType: "IMG", creativeType: "ESTATIC",
  dimensions: "1x1", copySlug: "RQA-SleepStruggles",
  filename: "korrus_s_004_1_RedditQ&A_ng_2026-03", date: "2026-03",
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] transition-colors flex-shrink-0"
      style={{ background: "var(--surface-3)", color: copied ? "#4ade80" : "var(--text-secondary)", border: "none", cursor: "pointer" }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function NamingGuide() {
  const [activeField, setActiveField] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(DEFAULT_VALUES);

  const adName = FIELDS.map((f) => values[f.key] ?? "").join("__");
  const segments = FIELDS.map((f) => values[f.key] ?? "");

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "var(--surface-0)" }}>

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4" style={{ borderBottom: "1px solid var(--surface-3)" }}>
        <h2 className="font-semibold" style={{ fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>Naming Guide</h2>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
          12-field ad naming convention — edit any field below to preview the full name live
        </p>
      </div>

      <div className="flex-1 px-6 py-5 space-y-5 max-w-4xl">

        {/* Live ad name output */}
        <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.1em", color: "var(--text-muted)" }}>
              Live Preview
            </span>
            <CopyBtn text={adName} />
          </div>

          {/* Coloured segments */}
          <div className="flex flex-wrap gap-0 font-mono leading-relaxed" style={{ fontSize: "11px" }}>
            {segments.map((seg, i) => (
              <span key={i} className="flex items-center">
                <span
                  className="rounded-sm px-0.5 transition-all cursor-default"
                  style={{
                    color: FIELDS[i].color,
                    background: activeField === FIELDS[i].key ? `${FIELDS[i].color}22` : "transparent",
                    fontWeight: activeField === FIELDS[i].key ? 700 : 400,
                    fontFamily: "'IBM Plex Mono', monospace",
                    outline: activeField === FIELDS[i].key ? `1px solid ${FIELDS[i].color}40` : "none",
                    borderRadius: "3px",
                  }}
                  onMouseEnter={() => setActiveField(FIELDS[i].key)}
                  onMouseLeave={() => setActiveField(null)}
                  title={`${FIELDS[i].label}: ${seg}`}
                >
                  {seg || <span style={{ opacity: 0.3 }}>…</span>}
                </span>
                {i < segments.length - 1 && (
                  <span style={{ color: "var(--text-muted)", opacity: 0.35, fontFamily: "'IBM Plex Mono', monospace" }}>__</span>
                )}
              </span>
            ))}
          </div>

          {/* Field legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1" style={{ borderTop: "1px solid var(--surface-2)" }}>
            {FIELDS.map((f) => (
              <button
                key={f.key}
                className="text-[10px] transition-opacity bg-transparent border-none p-0 cursor-pointer"
                style={{ color: f.color, opacity: activeField && activeField !== f.key ? 0.3 : 1, fontFamily: "'IBM Plex Mono', monospace" }}
                onMouseEnter={() => setActiveField(f.key)}
                onMouseLeave={() => setActiveField(null)}
              >
                {f.position}·{f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Structure note */}
        <div className="rounded-md px-4 py-3 text-[11px]" style={{ background: "rgba(0,153,198,0.05)", border: "1px solid rgba(0,153,198,0.15)", color: "var(--text-secondary)" }}>
          <span style={{ color: "#60A7C8", fontWeight: 600 }}>Rule: </span>
          Fields are joined with <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#60A7C8" }}>__</code> (double underscore).
          A blank field creates a visible gap <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#f87171" }}>____</code> — all fields must be filled before marking an ad{" "}
          <span style={{ color: "#4ade80" }}>Ready</span>.
        </div>

        {/* Interactive field cards */}
        <div className="space-y-2">
          {FIELDS.map((f) => {
            const isActive = activeField === f.key;
            return (
              <div
                key={f.key}
                className="rounded-lg overflow-hidden transition-all"
                style={{
                  border: `1px solid ${isActive ? f.color + "50" : "var(--surface-3)"}`,
                  background: isActive ? `${f.color}07` : "var(--surface-1)",
                }}
                onMouseEnter={() => setActiveField(f.key)}
                onMouseLeave={() => setActiveField(null)}
              >
                <div className="px-4 py-3 flex items-start gap-4">
                  {/* Badge */}
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold mt-0.5"
                    style={{ background: `${f.color}22`, color: f.color, fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {f.position}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{f.label}</span>
                        <code className="text-[11px]" style={{ color: f.color, fontFamily: "'IBM Plex Mono', monospace" }}>{values[f.key] || "—"}</code>
                      </div>

                      {/* Interactive input */}
                      {!f.fixed && (
                        f.options.length > 0 ? (
                          <select
                            value={values[f.key] || ""}
                            onChange={(e) => setValue(f.key, e.target.value)}
                            className="text-[11px] px-2 py-1 rounded-sm focus:outline-none"
                            style={{
                              background: "var(--surface-2)",
                              border: `1px solid ${f.color}40`,
                              color: f.color,
                              fontFamily: "'IBM Plex Mono', monospace",
                              cursor: "pointer",
                            }}
                          >
                            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={values[f.key] || ""}
                            onChange={(e) => setValue(f.key, e.target.value)}
                            placeholder={f.example}
                            className="text-[11px] px-2 py-1 rounded-sm focus:outline-none"
                            style={{
                              background: "var(--surface-2)",
                              border: `1px solid ${f.color}40`,
                              color: f.color,
                              fontFamily: "'IBM Plex Mono', monospace",
                              width: "200px",
                            }}
                            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = f.color; }}
                            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = `${f.color}40`; }}
                          />
                        )
                      )}
                      {f.fixed && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm" style={{ background: `${f.color}15`, color: f.color }}>always fixed</span>
                      )}
                    </div>

                    <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>{f.description}</p>
                    <ul className="space-y-0.5">
                      {f.rules.map((rule, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          <span className="mt-[3px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: f.color, opacity: 0.5 }} />
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
