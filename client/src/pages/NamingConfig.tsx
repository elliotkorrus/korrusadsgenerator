import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Copy, Check, Plus, Pencil, Trash2, X } from "lucide-react";

// ─── Shared ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "var(--surface-0)",
  border: "1px solid var(--surface-3)",
  color: "var(--text-primary)",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

function FormField({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>{label}</label>
      <input
        type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
        style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
        onFocus={(e) => { if (!disabled) (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
      />
    </div>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm border ${colors[status] || colors.draft || ""}`}>
      {status}
    </span>
  );
}

// ─── Tab: Guide ───────────────────────────────────────────────────────────────

const FIELDS = [
  { position: 1, key: "brand", label: "Brand", example: "OIO", color: "#60A7C8", description: "Always OIO. The ad-facing product brand.", rules: ["Always OIO — never KORRUS or anything else", "KORRUS is the company; OIO is the brand consumers see"], options: ["OIO"], fixed: true },
  { position: 2, key: "initiative", label: "Initiative", example: "s_004", color: "#a78bfa", description: "Sprint or campaign bucket. Format: letter + underscore + zero-padded number.", rules: ["s = sprint  ·  q = quarterly  ·  e = evergreen", "Increment per new campaign sprint"], options: [], fixed: false },
  { position: 3, key: "variation", label: "Variation", example: "v1", color: "#34d399", description: "Creative variant within the same concept.", rules: ["v + number: v1, v2, v3…", "Same angle + copy = same variation number", "New creative direction → new variation number"], options: ["v1", "v2", "v3", "v4", "v5"], fixed: false },
  { position: 4, key: "angle", label: "Angle", example: "RedditQ&A", color: "#f59e0b", description: "Marketing angle or hook. Comes from Creative Labels.", rules: ["No spaces — CamelCase or hyphens", "Must match a Creative Label entry", "Describes the emotional/logical hook, not the format"], options: ["RedditQ&A", "SocialProof", "ProblemAgitate", "EducationFirst", "BeforeAfter"], fixed: false },
  { position: 5, key: "source", label: "Source", example: "NG", color: "#fb923c", description: "Traffic source or creative origin.", rules: ["NG = No Growth  ·  PAID = paid media", "UGC = creator  ·  STUDIO = in-house", "STOCK = stock  ·  AI = AI-generated"], options: ["NG", "PAID", "UGC", "STUDIO", "STOCK", "AI"], fixed: false },
  { position: 6, key: "product", label: "Product", example: "OIO", color: "#38bdf8", description: "Product line this ad is for.", rules: ["OIO = OIO circadian bulb", "SERUM = future product line"], options: ["OIO", "SERUM"], fixed: false },
  { position: 7, key: "contentType", label: "Format", example: "IMG", color: "#e879f9", description: "File format of the creative asset.", rules: ["IMG = image  ·  VID = video", "GIF = animated  ·  CAR = carousel"], options: ["IMG", "VID", "GIF", "CAR"], fixed: false },
  { position: 8, key: "creativeType", label: "Type", example: "ESTATIC", color: "#4ade80", description: "Creative execution style.", rules: ["ESTATIC = elevated static  ·  UGC = creator style", "MEME  ·  GFX = motion  ·  MASHUP  ·  TESTI  ·  AI"], options: ["ESTATIC", "UGC", "MEME", "GFX", "MASHUP", "TESTI", "AI"], fixed: false },
  { position: 9, key: "dimensions", label: "Dims", example: "1x1", color: "#94a3b8", description: "Ad placement size. Auto-detected from pixel dimensions on drop.", rules: ["9x16 = Stories/Reels  ·  1x1 = square Feed", "4x5 = portrait Feed  ·  16x9 = landscape", "Colon → x in name (9:16 → 9x16)"], options: ["9x16", "1x1", "4x5", "16x9"], fixed: false },
  { position: 10, key: "copySlug", label: "Copy", example: "RQA-SleepStruggles", color: "#f472b6", description: "Specific ad copy variant. Links to a Copy Library entry.", rules: ["Must match a copy_slug in Copy Library", "Format: ANGLE-Descriptor (hyphens, no spaces)", "Required before marking an ad Ready"], options: ["RQA-SleepStruggles", "RQA-ReliableSetup", "RQA-CircadianDisorder"], fixed: false },
  { position: 11, key: "filename", label: "Filename", example: "korrus_s_004_1_RedditQ&A_ng_2026-03", color: "#a3a3a3", description: "Source filename — stored for traceability but excluded from the ad name.", rules: ["Not included in the generated ad name", "Stored in the DB so you can trace back to the original agency file", "Auto-parsed on drop — no manual entry needed"], options: [], fixed: true },
  { position: 12, key: "date", label: "Date", example: "2026-03", color: "#71717a", description: "Month the creative was produced (YYYY-MM).", rules: ["YYYY-MM — no day", "Auto-parsed from filename  ·  defaults to current month"], options: [], fixed: false },
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
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] transition-colors flex-shrink-0"
      style={{ background: "var(--surface-3)", color: copied ? "#4ade80" : "var(--text-secondary)", border: "none", cursor: "pointer" }}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function GuideTab() {
  const [active, setActive] = useState<string | null>(null);
  const [values, setValues] = useState(DEFAULT_VALUES);

  // Pull live data from the same sources as the other tabs
  const { data: angles = [] } = trpc.angles.list.useQuery({});
  const { data: copyEntries = [] } = trpc.copy.list.useQuery({});
  const { data: fieldOpts = [] } = trpc.fieldOptions.list.useQuery();

  // Build dynamic options per field — falls back to the static list if DB is empty
  const dynamicOptions: Record<string, string[]> = {
    angle: angles.filter((a) => a.status === "active").map((a) => a.angleSlug),
    copySlug: copyEntries.filter((c) => c.status === "active").map((c) => c.copySlug),
    source: fieldOpts.filter((o) => o.field === "source" && o.isActive).map((o) => o.value),
    product: fieldOpts.filter((o) => o.field === "product" && o.isActive).map((o) => o.value),
    contentType: fieldOpts.filter((o) => o.field === "contentType" && o.isActive).map((o) => o.value),
    creativeType: fieldOpts.filter((o) => o.field === "creativeType" && o.isActive).map((o) => o.value),
  };

  // Use live options if populated, otherwise fall back to static
  function getOptions(f: typeof FIELDS[number]): string[] {
    const live = dynamicOptions[f.key];
    return live && live.length > 0 ? live : f.options;
  }

  // Ad name preview — exclude filename, skip empty fields (matches generateAdName behaviour)
  const adName = FIELDS.filter((f) => f.key !== "filename").map((f) => values[f.key] ?? "").filter(Boolean).join("__");

  return (
    <div className="space-y-5">
      {/* Live preview */}
      <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase" style={{ letterSpacing: "0.1em", color: "var(--text-muted)" }}>Live Preview</span>
          <CopyBtn text={adName} />
        </div>
        <div className="flex flex-wrap gap-0 leading-relaxed" style={{ fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace" }}>
          {FIELDS.map((f, i) => (
            <span key={f.key} className="flex items-center">
              <span className="rounded-sm px-0.5 transition-all cursor-default"
                style={{ color: f.color, background: active === f.key ? `${f.color}22` : "transparent", fontWeight: active === f.key ? 700 : 400, outline: active === f.key ? `1px solid ${f.color}40` : "none", borderRadius: "3px" }}
                onMouseEnter={() => setActive(f.key)} onMouseLeave={() => setActive(null)} title={f.label}>
                {values[f.key] || <span style={{ opacity: 0.3 }}>…</span>}
              </span>
              {i < FIELDS.length - 1 && <span style={{ color: "var(--text-muted)", opacity: 0.35 }}>__</span>}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1" style={{ borderTop: "1px solid var(--surface-2)" }}>
          {FIELDS.map((f) => (
            <button key={f.key} className="text-[10px] bg-transparent border-none p-0 cursor-pointer transition-opacity"
              style={{ color: f.color, opacity: active && active !== f.key ? 0.3 : 1, fontFamily: "'IBM Plex Mono', monospace" }}
              onMouseEnter={() => setActive(f.key)} onMouseLeave={() => setActive(null)}>
              {f.position}·{f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rule */}
      <div className="rounded-md px-4 py-3 text-[11px]" style={{ background: "rgba(0,153,198,0.05)", border: "1px solid rgba(0,153,198,0.15)", color: "var(--text-secondary)" }}>
        <span style={{ color: "#60A7C8", fontWeight: 600 }}>Rule: </span>
        Fields joined with <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#60A7C8" }}>__</code>. Empty fields are skipped —
        all required fields must be filled before marking an ad <span style={{ color: "#4ade80" }}>Ready</span>.
      </div>

      {/* Field cards */}
      <div className="space-y-2">
        {FIELDS.map((f) => {
          const opts = getOptions(f);
          return (
            <div key={f.key} className="rounded-lg overflow-hidden transition-all"
              style={{ border: `1px solid ${active === f.key ? f.color + "50" : "var(--surface-3)"}`, background: active === f.key ? `${f.color}07` : "var(--surface-1)" }}
              onMouseEnter={() => setActive(f.key)} onMouseLeave={() => setActive(null)}>
              <div className="px-4 py-3 flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold mt-0.5"
                  style={{ background: `${f.color}22`, color: f.color, fontFamily: "'IBM Plex Mono', monospace" }}>{f.position}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{f.label}</span>
                      <code className="text-[11px]" style={{ color: f.color, fontFamily: "'IBM Plex Mono', monospace" }}>{values[f.key] || "—"}</code>
                    </div>
                    {f.fixed ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm" style={{ background: `${f.color}15`, color: f.color }}>always fixed</span>
                    ) : opts.length > 0 ? (
                      <select value={values[f.key] || ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="text-[11px] px-2 py-1 rounded-sm focus:outline-none"
                        style={{ background: "var(--surface-2)", border: `1px solid ${f.color}40`, color: f.color, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer" }}>
                        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={values[f.key] || ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.example}
                        className="text-[11px] px-2 py-1 rounded-sm focus:outline-none"
                        style={{ background: "var(--surface-2)", border: `1px solid ${f.color}40`, color: f.color, fontFamily: "'IBM Plex Mono', monospace", width: "200px" }} />
                    )}
                  </div>
                  <p className="text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>{f.description}</p>
                  <ul className="space-y-0.5">
                    {f.rules.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        <span className="mt-[3px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: f.color, opacity: 0.5 }} />
                        {r}
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
  );
}

// ─── Tab: Copy Library ────────────────────────────────────────────────────────

type CopyEntry = { id: number; copySlug: string; headline: string; bodyCopy: string; product: string; status: string };
const emptyCopyForm = { copySlug: "", headline: "", bodyCopy: "", product: "OIO", status: "active" as const };
const copyStatusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/15",
  draft: "bg-zinc-100 text-zinc-500 border-zinc-300",
  retired: "bg-red-500/10 text-red-400 border-red-500/15",
};

function CopyTab() {
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.copy.list.useQuery({});
  const createMut = trpc.copy.create.useMutation({ onSuccess: () => { utils.copy.list.invalidate(); setOpen(false); } });
  const updateMut = trpc.copy.update.useMutation({ onSuccess: () => { utils.copy.list.invalidate(); setOpen(false); } });
  const deleteMut = trpc.copy.delete.useMutation({ onSuccess: () => utils.copy.list.invalidate() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CopyEntry | null>(null);
  const [form, setForm] = useState(emptyCopyForm);

  function openCreate() { setEditing(null); setForm(emptyCopyForm); setOpen(true); }
  function openEdit(item: CopyEntry) { setEditing(item); setForm({ copySlug: item.copySlug, headline: item.headline, bodyCopy: item.bodyCopy, product: item.product, status: item.status as any }); setOpen(true); }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); editing ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Headline and body copy variants — linked to the Copy field (position 10) in the ad name</p>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold rounded-md"
          style={{ background: "#0099C6" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}>
          <Plus className="w-3.5 h-3.5" /> Add Copy
        </button>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
        <table className="w-full" style={{ fontSize: "11px", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
            <tr>
              {["Slug", "Headline", "Body Copy", "Product", "Status", ""].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left font-semibold uppercase" style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)", textAlign: i === 5 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.025)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}>
                <td className="px-4 py-2.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#f472b6" }}>{item.copySlug}</td>
                <td className="px-4 py-2.5 max-w-[180px] truncate" style={{ color: "var(--text-primary)" }}>{item.headline}</td>
                <td className="px-4 py-2.5 max-w-[220px] truncate" style={{ color: "var(--text-secondary)" }}>{item.bodyCopy}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{item.product}</td>
                <td className="px-4 py-2.5"><StatusBadge status={item.status} colors={copyStatusColors} /></td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-sm transition-colors mr-1" style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteMut.mutate({ id: item.id })} className="p-1.5 rounded-sm transition-colors" style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.08)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>No copy entries yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4 p-6 rounded-lg" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ fontSize: "14px", color: "var(--text-primary)" }}>{editing ? "Edit Copy" : "Add Copy"}</h3>
              <button type="button" onClick={() => setOpen(false)} style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
            </div>
            <FormField label="Copy Slug" value={form.copySlug} onChange={(v) => setForm({ ...form, copySlug: v })} placeholder="e.g. RQA-SleepStruggles" />
            <FormField label="Headline" value={form.headline} onChange={(v) => setForm({ ...form, headline: v })} placeholder="Ad headline" />
            <div>
              <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Body Copy</label>
              <textarea value={form.bodyCopy} onChange={(e) => setForm({ ...form, bodyCopy: e.target.value })} className="w-full px-3 py-2 text-sm focus:outline-none resize-none rounded-sm" style={inputStyle} rows={3}
                onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--surface-3)"; }} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Product</label>
                <select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm" style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}>
                  <option value="OIO">OIO</option><option value="SERUM">SERUM</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm" style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}>
                  <option value="active">Active</option><option value="draft">Draft</option><option value="retired">Retired</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button type="submit" className="px-4 py-2 text-white text-sm font-medium rounded-md" style={{ background: "#0099C6" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}>
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Creative Labels ─────────────────────────────────────────────────────

type Angle = { id: number; angleSlug: string; description: string; example: string; product: string; funnelStage: string; sourceTypeFit: string | null; status: string };
const emptyAngleForm = { angleSlug: "", description: "", example: "", product: "OIO", funnelStage: "ALL" as const, sourceTypeFit: "", status: "active" as const };
const funnelColors: Record<string, string> = {
  TOF: "bg-blue-500/10 text-blue-400 border-blue-500/15",
  MOF: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  BOF: "bg-green-500/10 text-green-400 border-green-500/15",
  ALL: "bg-purple-500/10 text-purple-400 border-purple-500/15",
};
const angleStatusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/15",
  testing: "bg-amber-500/10 text-amber-400 border-amber-500/15",
  retired: "bg-red-500/10 text-red-400 border-red-500/15",
};

function LabelsTab() {
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.angles.list.useQuery({});
  const { data: allFieldOpts = [] } = trpc.fieldOptions.list.useQuery();
  const ctOpts = allFieldOpts.filter((o) => o.field === "creativeType");
  const createCtMut = trpc.fieldOptions.create.useMutation({ onSuccess: () => utils.fieldOptions.list.invalidate() });
  const deleteCtMut = trpc.fieldOptions.delete.useMutation({ onSuccess: () => utils.fieldOptions.list.invalidate() });
  const toggleCtMut = trpc.fieldOptions.update.useMutation({ onSuccess: () => utils.fieldOptions.list.invalidate() });
  const [ctInput, setCtInput] = useState("");

  const createMut = trpc.angles.create.useMutation({ onSuccess: () => { utils.angles.list.invalidate(); setOpen(false); } });
  const updateMut = trpc.angles.update.useMutation({ onSuccess: () => { utils.angles.list.invalidate(); setOpen(false); } });
  const deleteMut = trpc.angles.delete.useMutation({ onSuccess: () => utils.angles.list.invalidate() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Angle | null>(null);
  const [form, setForm] = useState(emptyAngleForm);

  function openCreate() { setEditing(null); setForm(emptyAngleForm); setOpen(true); }
  function openEdit(item: Angle) { setEditing(item); setForm({ angleSlug: item.angleSlug, description: item.description, example: item.example, product: item.product, funnelStage: item.funnelStage as any, sourceTypeFit: item.sourceTypeFit || "", status: item.status as any }); setOpen(true); }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); editing ? updateMut.mutate({ id: editing.id, ...form }) : createMut.mutate(form); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Creative types — linked to the Angle field (position 4) in the ad name</p>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold rounded-md" style={{ background: "#0099C6" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}>
          <Plus className="w-3.5 h-3.5" /> Add Label
        </button>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
        <table className="w-full" style={{ fontSize: "11px", borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
            <tr>
              {["Slug", "Description", "Example Hook", "Funnel", "Status", ""].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left font-semibold uppercase" style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-muted)", textAlign: i === 5 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.025)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}>
                <td className="px-4 py-2.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#f59e0b" }}>{item.angleSlug}</td>
                <td className="px-4 py-2.5 max-w-[180px] truncate" style={{ color: "var(--text-primary)" }}>{item.description}</td>
                <td className="px-4 py-2.5 max-w-[200px] truncate" style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>&ldquo;{item.example}&rdquo;</td>
                <td className="px-4 py-2.5"><span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm border ${funnelColors[item.funnelStage] || funnelColors.ALL}`}>{item.funnelStage}</span></td>
                <td className="px-4 py-2.5"><StatusBadge status={item.status} colors={angleStatusColors} /></td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-sm transition-colors mr-1" style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteMut.mutate({ id: item.id })} className="p-1.5 rounded-sm transition-colors" style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.08)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>No labels yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Creative Types section */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Creative Format</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Execution format — position 8 in the ad name (e.g. ESTATIC, UGC, MEME)</p>
          </div>
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
          {/* Add row */}
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
            <input
              type="text"
              value={ctInput}
              onChange={(e) => setCtInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ctInput.trim()) {
                  createCtMut.mutate({ field: "creativeType", value: ctInput.trim(), sortOrder: ctOpts.length });
                  setCtInput("");
                }
              }}
              placeholder="Type slug and press Enter… e.g. MEME"
              className="flex-1 px-3 py-1.5 text-[11px] rounded-sm focus:outline-none"
              style={{ background: "var(--surface-0)", border: "1px solid var(--surface-3)", color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace" }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.5)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
            />
            <button
              onClick={() => { if (ctInput.trim()) { createCtMut.mutate({ field: "creativeType", value: ctInput.trim(), sortOrder: ctOpts.length }); setCtInput(""); } }}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-sm"
              style={{ color: "#60A7C8", background: "rgba(0,153,198,0.08)", border: "1px solid rgba(0,153,198,0.15)" }}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {/* List */}
          {ctOpts.length === 0 && (
            <div className="px-4 py-4 text-[11px]" style={{ color: "var(--text-muted)", background: "var(--surface-0)" }}>No creative types yet.</div>
          )}
          {ctOpts.map((opt, i) => (
            <div
              key={opt.id}
              className="flex items-center justify-between px-4 py-2"
              style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none", background: "var(--surface-0)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,153,198,0.02)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-0)"; }}
            >
              <code className="text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#4ade80" }}>{opt.value}</code>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleCtMut.mutate({ id: opt.id, isActive: !opt.isActive })}
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded-sm border transition-colors"
                  style={opt.isActive
                    ? { background: "rgba(74,222,128,0.08)", color: "#4ade80", borderColor: "rgba(74,222,128,0.2)" }
                    : { background: "var(--surface-2)", color: "var(--text-muted)", borderColor: "var(--surface-3)" }}
                >
                  {opt.isActive ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => deleteCtMut.mutate({ id: opt.id })}
                  className="p-1.5 rounded-sm transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.08)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4 p-6 rounded-lg" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ fontSize: "14px", color: "var(--text-primary)" }}>{editing ? "Edit Label" : "Add Label"}</h3>
              <button type="button" onClick={() => setOpen(false)} style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
            </div>
            <FormField label="Slug" value={form.angleSlug} onChange={(v) => setForm({ ...form, angleSlug: v })} placeholder="e.g. RedditQ&A" />
            <div>
              <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm focus:outline-none resize-none rounded-sm" style={inputStyle} rows={2}
                onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--surface-3)"; }} />
            </div>
            <FormField label="Example Hook" value={form.example} onChange={(v) => setForm({ ...form, example: v })} placeholder="e.g. Nothing works for my sleep..." />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Funnel Stage</label>
                <select value={form.funnelStage} onChange={(e) => setForm({ ...form, funnelStage: e.target.value as any })} className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm" style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}>
                  <option value="TOF">TOF</option><option value="MOF">MOF</option><option value="BOF">BOF</option><option value="ALL">ALL</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm" style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}>
                  <option value="active">Active</option><option value="testing">Testing</option><option value="retired">Retired</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button type="submit" className="px-4 py-2 text-white text-sm font-medium rounded-md" style={{ background: "#0099C6" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}>
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Field Options ───────────────────────────────────────────────────────

const FIELD_GROUPS = [
  { field: "source", label: "Source", description: "Traffic source or creative origin" },
  { field: "product", label: "Product", description: "Product line this ad promotes" },
  { field: "contentType", label: "Format", description: "File type of the creative asset" },
];

const UPLOAD_DEFAULTS_GROUPS = [
  { field: "adSet", label: "Ad Sets", description: "Meta ad sets to target — ID and name" },
  { field: "destinationUrl", label: "Destination URLs", description: "Landing page URLs for ads" },
  { field: "igHandle", label: "Instagram Handles", description: "IG accounts to run ads through" },
  { field: "metaAccount", label: "Meta Accounts", description: "Ad account identifiers" },
];

function OptionsTab() {
  const utils = trpc.useUtils();
  const { data: options = [] } = trpc.fieldOptions.list.useQuery();
  const createMut = trpc.fieldOptions.create.useMutation({ onSuccess: () => { utils.fieldOptions.list.invalidate(); setOpen(false); } });
  const updateMut = trpc.fieldOptions.update.useMutation({ onSuccess: () => { utils.fieldOptions.list.invalidate(); setOpen(false); } });
  const deleteMut = trpc.fieldOptions.delete.useMutation({ onSuccess: () => utils.fieldOptions.list.invalidate() });
  const toggleMut = trpc.fieldOptions.update.useMutation({ onSuccess: () => utils.fieldOptions.list.invalidate() });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formField, setFormField] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formSort, setFormSort] = useState(0);

  function openCreate(field: string) { setEditingId(null); setFormField(field); setFormValue(""); setFormLabel(""); setFormSort(0); setOpen(true); }
  function openEdit(opt: any) { setEditingId(opt.id); setFormField(opt.field); setFormValue(opt.value); setFormLabel(opt.label || ""); setFormSort(opt.sortOrder); setOpen(true); }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); editingId ? updateMut.mutate({ id: editingId, value: formValue, label: formLabel || null, sortOrder: formSort }) : createMut.mutate({ field: formField, value: formValue, label: formLabel || undefined, sortOrder: formSort }); }

  return (
    <div>
      <p className="text-[11px] mb-4" style={{ color: "var(--text-muted)" }}>Dropdown values for the Upload Queue — changes take effect immediately</p>

      {/* Naming Fields */}
      <h4 className="text-[10px] uppercase font-semibold mb-2" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Naming Fields</h4>
      <div className="space-y-3">
        {FIELD_GROUPS.map((group) => {
          const fieldOpts = options.filter((o) => o.field === group.field);
          return (
            <div key={group.field} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--surface-1)", borderBottom: fieldOpts.length > 0 ? "1px solid var(--surface-3)" : "none" }}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{group.label}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{group.description}</span>
                </div>
                <button onClick={() => openCreate(group.field)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm transition-colors"
                  style={{ color: "#60A7C8", background: "rgba(0,153,198,0.08)", border: "1px solid rgba(0,153,198,0.15)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,153,198,0.15)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,153,198,0.08)"; }}>
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {fieldOpts.map((opt, i) => (
                <div key={opt.id} className="flex items-center justify-between px-4 py-2"
                  style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none", background: "var(--surface-0)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,153,198,0.02)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-0)"; }}>
                  <div className="flex items-center gap-3">
                    <code className="text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#60A7C8" }}>{opt.value}</code>
                    {opt.label && <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{opt.label}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleMut.mutate({ id: opt.id, isActive: !opt.isActive })} className="px-1.5 py-0.5 text-[10px] font-medium rounded-sm border transition-colors"
                      style={opt.isActive ? { background: "rgba(74,222,128,0.08)", color: "#4ade80", borderColor: "rgba(74,222,128,0.2)" } : { background: "var(--surface-2)", color: "var(--text-muted)", borderColor: "var(--surface-3)" }}>
                      {opt.isActive ? "Active" : "Inactive"}
                    </button>
                    <button onClick={() => openEdit(opt)} className="p-1.5 rounded-sm transition-colors" style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteMut.mutate({ id: opt.id })} className="p-1.5 rounded-sm transition-colors" style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.08)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {fieldOpts.length === 0 && <div className="px-4 py-3 text-[11px]" style={{ color: "var(--text-muted)", background: "var(--surface-0)" }}>No options yet.</div>}
            </div>
          );
        })}
      </div>

      {/* Upload Defaults */}
      <h4 className="text-[10px] uppercase font-semibold mb-2 mt-6" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Upload Defaults</h4>
      <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>Saved values for Meta upload fields — select from these when setting up ads</p>
      <div className="space-y-3">
        {UPLOAD_DEFAULTS_GROUPS.map((group) => {
          const fieldOpts = options.filter((o) => o.field === group.field);
          return (
            <div key={group.field} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--surface-1)", borderBottom: fieldOpts.length > 0 ? "1px solid var(--surface-3)" : "none" }}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{group.label}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{group.description}</span>
                </div>
                <button onClick={() => openCreate(group.field)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm transition-colors"
                  style={{ color: "#60A7C8", background: "rgba(0,153,198,0.08)", border: "1px solid rgba(0,153,198,0.15)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,153,198,0.15)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,153,198,0.08)"; }}>
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {fieldOpts.map((opt, i) => (
                <div key={opt.id} className="flex items-center justify-between px-4 py-2"
                  style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none", background: "var(--surface-0)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,153,198,0.02)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-0)"; }}>
                  <div className="flex items-center gap-3">
                    <code className="text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#60A7C8" }}>{opt.value}</code>
                    {opt.label && <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{opt.label}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleMut.mutate({ id: opt.id, isActive: !opt.isActive })} className="px-1.5 py-0.5 text-[10px] font-medium rounded-sm border transition-colors"
                      style={opt.isActive ? { background: "rgba(74,222,128,0.08)", color: "#4ade80", borderColor: "rgba(74,222,128,0.2)" } : { background: "var(--surface-2)", color: "var(--text-muted)", borderColor: "var(--surface-3)" }}>
                      {opt.isActive ? "Active" : "Inactive"}
                    </button>
                    <button onClick={() => openEdit(opt)} className="p-1.5 rounded-sm transition-colors" style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteMut.mutate({ id: opt.id })} className="p-1.5 rounded-sm transition-colors" style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.08)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {fieldOpts.length === 0 && <div className="px-4 py-3 text-[11px]" style={{ color: "var(--text-muted)", background: "var(--surface-0)" }}>No options yet.</div>}
            </div>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-6 rounded-lg" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ fontSize: "14px", color: "var(--text-primary)" }}>{editingId ? "Edit Option" : "Add Option"}</h3>
              <button type="button" onClick={() => setOpen(false)} style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
            </div>
            <FormField label="Field" value={formField} onChange={() => {}} disabled />
            <FormField label="Value (slug — used in ad name)" value={formValue} onChange={setFormValue} />
            <FormField label="Label (display name)" value={formLabel} onChange={setFormLabel} />
            <div>
              <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Sort Order</label>
              <input type="number" value={formSort} onChange={(e) => setFormSort(Number(e.target.value))} className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm" style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button type="submit" className="px-4 py-2 text-white text-sm font-medium rounded-md" style={{ background: "#0099C6" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}>
                {editingId ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "guide", label: "Guide" },
  { key: "copy", label: "Copy Library" },
  { key: "labels", label: "Creative Labels" },
  { key: "options", label: "Field Options" },
] as const;

type Tab = typeof TABS[number]["key"];

export default function NamingConfig() {
  const [tab, setTab] = useState<Tab>("guide");

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "var(--surface-0)" }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-4 pb-0" style={{ borderBottom: "1px solid var(--surface-3)" }}>
        <div className="mb-3">
          <h2 className="font-semibold" style={{ fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>Naming & Config</h2>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
            Ad naming convention, copy variants, creative labels, and field values
          </p>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 text-[11px] font-medium transition-all border-b-2"
              style={{
                borderBottomColor: tab === t.key ? "#0099C6" : "transparent",
                color: tab === t.key ? "var(--text-primary)" : "var(--text-muted)",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${tab === t.key ? "#0099C6" : "transparent"}`,
                cursor: "pointer",
                marginBottom: "-1px",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-6 py-5 max-w-4xl">
        {tab === "guide" && <GuideTab />}
        {tab === "copy" && <CopyTab />}
        {tab === "labels" && <LabelsTab />}
        {tab === "options" && <OptionsTab />}
      </div>
    </div>
  );
}
