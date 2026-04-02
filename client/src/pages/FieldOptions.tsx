import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const FIELD_GROUPS = [
  { field: "angle", label: "Theme", description: "Marketing angle / hook for the creative" },
  { field: "creativeType", label: "Creative Style", description: "Execution style of the creative (UGC, HIFI, etc.)" },
  { field: "source", label: "Producer", description: "Who produced the creative asset" },
  { field: "contentType", label: "Ad Format", description: "File type of the creative asset (IMG, VID, CAR)" },
  { field: "product", label: "Product", description: "Product line this ad promotes" },
  { field: "dimensions", label: "Dimensions", description: "Ad placement aspect ratios" },
];

const inputStyle: React.CSSProperties = {
  background: "var(--surface-0)",
  border: "1px solid var(--surface-3)",
  color: "var(--text-primary)",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

export default function FieldOptions() {
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

  function openCreate(field: string) {
    setEditingId(null); setFormField(field); setFormValue(""); setFormLabel(""); setFormSort(0); setOpen(true);
  }
  function openEdit(opt: any) {
    setEditingId(opt.id); setFormField(opt.field); setFormValue(opt.value); setFormLabel(opt.label || ""); setFormSort(opt.sortOrder); setOpen(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) updateMut.mutate({ id: editingId, value: formValue, label: formLabel || null, sortOrder: formSort });
    else createMut.mutate({ field: formField, value: formValue, label: formLabel || undefined, sortOrder: formSort });
  }

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: "var(--surface-0)" }}>
      <div className="flex-shrink-0 px-6 py-4" style={{ borderBottom: "1px solid var(--surface-3)" }}>
        <h2 className="font-semibold" style={{ fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>Field Options</h2>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Dropdown values for the Upload Queue — changes take effect immediately</p>
      </div>

      <div className="px-6 py-5 space-y-4 max-w-2xl">
        {FIELD_GROUPS.map((group) => {
          const fieldOpts = options.filter((o) => o.field === group.field);
          return (
            <div key={group.field} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--surface-3)" }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--surface-1)", borderBottom: fieldOpts.length > 0 ? "1px solid var(--surface-3)" : "none" }}>
                <div>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{group.label}</span>
                  <span className="ml-2 text-[10px]" style={{ color: "var(--text-muted)" }}>{group.description}</span>
                </div>
                <button
                  onClick={() => openCreate(group.field)}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm transition-colors"
                  style={{ color: "#60A7C8", background: "rgba(0,153,198,0.08)", border: "1px solid rgba(0,153,198,0.15)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,153,198,0.15)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,153,198,0.08)"; }}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {fieldOpts.map((opt, i) => (
                <div
                  key={opt.id}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderTop: i > 0 ? "1px solid var(--surface-2)" : "none", background: "var(--surface-0)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,153,198,0.025)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--surface-0)"; }}
                >
                  <div className="flex items-center gap-3">
                    <code className="text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#60A7C8" }}>{opt.value}</code>
                    {opt.label && <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{opt.label}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleMut.mutate({ id: opt.id, isActive: !opt.isActive })}
                      className="px-1.5 py-0.5 text-[10px] font-medium rounded-sm border transition-colors"
                      style={opt.isActive
                        ? { background: "rgba(74,222,128,0.08)", color: "#4ade80", borderColor: "rgba(74,222,128,0.2)" }
                        : { background: "var(--surface-2)", color: "var(--text-muted)", borderColor: "var(--surface-3)" }
                      }
                    >
                      {opt.isActive ? "Active" : "Inactive"}
                    </button>
                    <button
                      onClick={() => openEdit(opt)}
                      className="p-1.5 rounded-sm transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate({ id: opt.id })}
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
              {fieldOpts.length === 0 && (
                <div className="px-4 py-4 text-[11px]" style={{ color: "var(--text-muted)", background: "var(--surface-0)" }}>
                  No options yet — click Add to create one.
                </div>
              )}
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
            {[
              { label: "Field", value: formField, disabled: true, onChange: () => {} },
              { label: "Value (slug — used in ad name)", value: formValue, disabled: false, onChange: (v: string) => setFormValue(v) },
              { label: "Label (display name in dropdown)", value: formLabel, disabled: false, onChange: (v: string) => setFormLabel(v) },
            ].map(({ label, value, disabled, onChange }) => (
              <div key={label}>
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>{label}</label>
                <input
                  type="text" value={value} disabled={disabled}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
                  onFocus={(e) => { if (!disabled) (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
                />
              </div>
            ))}
            <div>
              <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>Sort Order</label>
              <input type="number" value={formSort} onChange={(e) => setFormSort(Number(e.target.value))} className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm" style={inputStyle}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>Cancel</button>
              <button type="submit" className="px-4 py-2 text-white text-sm font-medium rounded-md" style={{ background: "#0099C6" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
              >{editingId ? "Update" : "Create"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
