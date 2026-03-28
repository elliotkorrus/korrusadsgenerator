import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Plus, Pencil, Trash2, X } from "lucide-react";

type Angle = {
  id: number;
  angleSlug: string;
  description: string;
  example: string;
  product: string;
  funnelStage: string;
  sourceTypeFit: string | null;
  status: string;
};

const emptyForm = {
  angleSlug: "",
  description: "",
  example: "",
  product: "OIO",
  funnelStage: "ALL" as const,
  sourceTypeFit: "",
  status: "active" as const,
};

export default function AngleBank() {
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.angles.list.useQuery({});
  const createMut = trpc.angles.create.useMutation({
    onSuccess: () => { utils.angles.list.invalidate(); setOpen(false); },
  });
  const updateMut = trpc.angles.update.useMutation({
    onSuccess: () => { utils.angles.list.invalidate(); setOpen(false); },
  });
  const deleteMut = trpc.angles.delete.useMutation({
    onSuccess: () => utils.angles.list.invalidate(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Angle | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(item: Angle) {
    setEditing(item);
    setForm({
      angleSlug: item.angleSlug,
      description: item.description,
      example: item.example,
      product: item.product,
      funnelStage: item.funnelStage as any,
      sourceTypeFit: item.sourceTypeFit || "",
      status: item.status as any,
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      updateMut.mutate({ id: editing.id, ...form });
    } else {
      createMut.mutate(form);
    }
  }

  const funnelColors: Record<string, string> = {
    TOF: "bg-blue-500/10 text-blue-400 border-blue-500/15",
    MOF: "bg-amber-500/10 text-amber-400 border-amber-500/15",
    BOF: "bg-green-500/10 text-green-400 border-green-500/15",
    ALL: "bg-purple-500/10 text-purple-400 border-purple-500/15",
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-0)",
    border: "1px solid var(--surface-3)",
    color: "var(--text-primary)",
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="font-semibold leading-none"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}
          >
            Angle Bank
          </h2>
          <p className="mt-0.5" style={{ fontSize: "11px", color: "var(--text-muted)" }}>Strategic angles for ad creative</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold tracking-wide rounded-md transition-colors"
          style={{ background: "#0099C6" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Angle
        </button>
      </div>

      <div className="overflow-hidden rounded-sm" style={{ border: "1px solid var(--surface-3)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
            <tr>
              {["Slug", "Description", "Example Hook", "Funnel", "Status", "Actions"].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-2.5 text-left font-semibold uppercase${i === 5 ? " text-right" : ""}`}
                  style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                style={{ borderTop: "1px solid var(--surface-2)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(0,153,198,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
              >
                <td
                  className="px-4 py-2.5"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#60A7C8" }}
                >
                  {item.angleSlug}
                </td>
                <td className="px-4 py-2.5 max-w-[200px] truncate" style={{ fontSize: "12px", color: "var(--text-primary)" }}>{item.description}</td>
                <td className="px-4 py-2.5 max-w-[250px] truncate" style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  &ldquo;{item.example}&rdquo;
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm border ${funnelColors[item.funnelStage] || funnelColors.ALL}`}
                  >
                    {item.funnelStage}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 rounded-sm transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-3)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                      (e.currentTarget as HTMLButtonElement).style.background = "";
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteMut.mutate({ id: item.id })}
                    className="p-1.5 rounded-sm transition-colors ml-1"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "#f85149";
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.1)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                      (e.currentTarget as HTMLButtonElement).style.background = "";
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                  No angles yet. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg space-y-4 p-6 rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)" }}
          >
            <div className="flex items-center justify-between">
              <h3
                className="font-semibold"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "15px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}
              >
                {editing ? "Edit Angle" : "Add Angle"}
              </h3>
              <button type="button" onClick={() => setOpen(false)} style={{ color: "var(--text-secondary)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <InputField label="Angle Slug" value={form.angleSlug} onChange={(v) => setForm({ ...form, angleSlug: v })} placeholder="e.g. social-proof" />
            <div>
              <label
                className="block text-[10px] mb-1 uppercase font-semibold"
                style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
              >
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 text-sm focus:outline-none resize-none rounded-sm"
                style={inputStyle}
                rows={2}
                onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--surface-3)"; }}
              />
            </div>
            <InputField label="Example Hook" value={form.example} onChange={(v) => setForm({ ...form, example: v })} placeholder="Example headline/hook" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  className="block text-[10px] mb-1 uppercase font-semibold"
                  style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
                >
                  Funnel Stage
                </label>
                <select
                  value={form.funnelStage}
                  onChange={(e) => setForm({ ...form, funnelStage: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}
                >
                  <option value="TOF">TOF</option>
                  <option value="MOF">MOF</option>
                  <option value="BOF">BOF</option>
                  <option value="ALL">ALL</option>
                </select>
              </div>
              <div className="flex-1">
                <label
                  className="block text-[10px] mb-1 uppercase font-semibold"
                  style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
                >
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}
                >
                  <option value="active">Active</option>
                  <option value="testing">Testing</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>
            <InputField label="Source Type Fit (optional)" value={form.sourceTypeFit} onChange={(v) => setForm({ ...form, sourceTypeFit: v })} placeholder="e.g. UGC, ESTATIC" />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-white text-sm font-medium rounded-md transition-colors"
                style={{ background: "#0099C6" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
              >
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/15",
    testing: "bg-amber-500/10 text-amber-400 border-amber-500/15",
    retired: "bg-red-500/10 text-red-400 border-red-500/15",
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm border ${colors[status] || colors.active}`}>
      {status}
    </span>
  );
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const inputStyle: React.CSSProperties = {
    background: "var(--surface-0)",
    border: "1px solid var(--surface-3)",
    color: "var(--text-primary)",
  };
  return (
    <div>
      <label
        className="block text-[10px] mb-1 uppercase font-semibold"
        style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
        style={inputStyle}
        onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
        onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
      />
    </div>
  );
}
