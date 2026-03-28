import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Plus, Pencil, Trash2, X } from "lucide-react";

type CopyEntry = {
  id: number;
  copySlug: string;
  headline: string;
  bodyCopy: string;
  product: string;
  status: string;
};

const emptyForm = {
  copySlug: "",
  headline: "",
  bodyCopy: "",
  product: "OIO",
  status: "active" as const,
};

export default function CopyLibrary() {
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.copy.list.useQuery({});
  const createMut = trpc.copy.create.useMutation({
    onSuccess: () => {
      utils.copy.list.invalidate();
      setOpen(false);
    },
  });
  const updateMut = trpc.copy.update.useMutation({
    onSuccess: () => {
      utils.copy.list.invalidate();
      setOpen(false);
    },
  });
  const deleteMut = trpc.copy.delete.useMutation({
    onSuccess: () => utils.copy.list.invalidate(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CopyEntry | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(item: CopyEntry) {
    setEditing(item);
    setForm({
      copySlug: item.copySlug,
      headline: item.headline,
      bodyCopy: item.bodyCopy,
      product: item.product,
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
            Copy Library
          </h2>
          <p className="mt-0.5" style={{ fontSize: "11px", color: "var(--text-muted)" }}>Headlines and body copy variants</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold tracking-wide rounded-md transition-colors"
          style={{ background: "#0099C6" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Copy
        </button>
      </div>

      <div className="overflow-hidden rounded-sm" style={{ border: "1px solid var(--surface-3)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
            <tr>
              {["Slug", "Headline", "Body Copy", "Product", "Status", "Actions"].map((h, i) => (
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
                  {item.copySlug}
                </td>
                <td className="px-4 py-2.5 max-w-[200px] truncate" style={{ fontSize: "12px", color: "var(--text-primary)" }}>{item.headline}</td>
                <td className="px-4 py-2.5 max-w-[250px] truncate" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  {item.bodyCopy}
                </td>
                <td className="px-4 py-2.5" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{item.product}</td>
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
                  No copy entries yet. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
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
                {editing ? "Edit Copy" : "Add Copy"}
              </h3>
              <button type="button" onClick={() => setOpen(false)} style={{ color: "var(--text-secondary)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <Field
              label="Copy Slug"
              value={form.copySlug}
              onChange={(v) => setForm({ ...form, copySlug: v })}
              placeholder="e.g. EVG, SPRING25"
            />
            <Field
              label="Headline"
              value={form.headline}
              onChange={(v) => setForm({ ...form, headline: v })}
              placeholder="Ad headline"
            />
            <div>
              <label
                className="block text-[10px] mb-1 uppercase font-semibold"
                style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
              >
                Body Copy
              </label>
              <textarea
                value={form.bodyCopy}
                onChange={(e) => setForm({ ...form, bodyCopy: e.target.value })}
                className="w-full px-3 py-2 text-sm focus:outline-none resize-none rounded-sm"
                style={inputStyle}
                rows={3}
                placeholder="Ad body copy"
                onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--surface-3)"; }}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label
                  className="block text-[10px] mb-1 uppercase font-semibold"
                  style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}
                >
                  Product
                </label>
                <select
                  value={form.product}
                  onChange={(e) => setForm({ ...form, product: e.target.value })}
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}
                >
                  <option value="OIO">OIO</option>
                  <option value="SERUM">SERUM</option>
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
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as any })
                  }
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = "var(--surface-3)"; }}
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>
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
    draft: "bg-[#21262d] text-[#8b949e] border-[#30363d]",
    retired: "bg-red-500/10 text-red-400 border-red-500/15",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm border ${colors[status] || colors.draft}`}
    >
      {status}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
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
