import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";

type HandleEntry = {
  id: number;
  handle: string;
  label: string | null;
  fbPageId: string;
  igAccountId: string;
  isDefault: boolean;
};

const emptyForm = {
  handle: "",
  label: "",
  fbPageId: "",
  igAccountId: "",
  isDefault: false,
};

export default function HandleBank() {
  const utils = trpc.useUtils();
  const { data: items = [] } = trpc.handles.list.useQuery();
  const createMut = trpc.handles.create.useMutation({
    onSuccess: () => { utils.handles.list.invalidate(); setOpen(false); },
  });
  const updateMut = trpc.handles.update.useMutation({
    onSuccess: () => { utils.handles.list.invalidate(); setOpen(false); },
  });
  const deleteMut = trpc.handles.delete.useMutation({
    onSuccess: () => utils.handles.list.invalidate(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HandleEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; handle: string } | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(item: HandleEntry) {
    setEditing(item);
    setForm({
      handle: item.handle,
      label: item.label || "",
      fbPageId: item.fbPageId,
      igAccountId: item.igAccountId,
      isDefault: item.isDefault,
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
            Handle Bank
          </h2>
          <p className="mt-0.5" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Manage creator handles with their Facebook Page IDs and Instagram Account IDs for whitelisting
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold tracking-wide rounded-md transition-colors"
          style={{ background: "#0099C6" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#007a9e"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#0099C6"; }}
        >
          <Plus className="w-3.5 h-3.5" /> Add Handle
        </button>
      </div>

      <div className="overflow-hidden rounded-sm" style={{ border: "1px solid var(--surface-3)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--surface-1)", borderBottom: "1px solid var(--surface-3)" }}>
            <tr>
              {["Handle", "Label", "Facebook Page ID", "Instagram Account ID", "Default", "Actions"].map((h, i) => (
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
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: "#60A7C8", fontWeight: 500 }}
                >
                  {item.handle}
                </td>
                <td className="px-4 py-2.5" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  {item.label || <span style={{ color: "var(--text-muted)" }}>-</span>}
                </td>
                <td className="px-4 py-2.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "var(--text-primary)" }}>
                  {item.fbPageId || <span style={{ color: "var(--text-muted)" }}>Not set</span>}
                </td>
                <td className="px-4 py-2.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "var(--text-primary)" }}>
                  {item.igAccountId || <span style={{ color: "var(--text-muted)" }}>Not set</span>}
                </td>
                <td className="px-4 py-2.5">
                  {item.isDefault && (
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm border bg-green-500/10 text-green-400 border-green-500/20">
                      Default
                    </span>
                  )}
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
                    onClick={() => setDeleteTarget({ id: item.id, handle: item.handle })}
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
                  No handles yet. Add one to get started.
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
                {editing ? "Edit Handle" : "Add Handle"}
              </h3>
              <button type="button" onClick={() => setOpen(false)} style={{ color: "var(--text-secondary)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                  Handle *
                </label>
                <input
                  type="text"
                  value={form.handle}
                  onChange={(e) => setForm({ ...form, handle: e.target.value })}
                  placeholder="e.g. korruscircadian"
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                  Label
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Korrus Main Account"
                  className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                Facebook Page ID
              </label>
              <input
                type="text"
                value={form.fbPageId}
                onChange={(e) => setForm({ ...form, fbPageId: e.target.value })}
                placeholder="e.g. 120241885083180419"
                className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
              />
            </div>

            <div>
              <label className="block text-[10px] mb-1 uppercase font-semibold" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                Instagram Account ID
              </label>
              <input
                type="text"
                value={form.igAccountId}
                onChange={(e) => setForm({ ...form, igAccountId: e.target.value })}
                placeholder="e.g. 17841400..."
                className="w-full px-3 py-2 text-sm focus:outline-none rounded-sm"
                style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.6)"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="accent-[#0099C6]"
                id="isDefault"
              />
              <label htmlFor="isDefault" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Set as default handle
              </label>
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete handle?"
        message={deleteTarget ? `Delete "${deleteTarget.handle}"? Any ads using this handle will need to be reassigned.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deleteTarget) deleteMut.mutate({ id: deleteTarget.id }); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
