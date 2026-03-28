import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const FIELD_GROUPS = [
  { field: "contentType", label: "Content Type (Format)" },
  { field: "creativeType", label: "Creative Type" },
  { field: "dimensions", label: "Dimensions" },
  { field: "product", label: "Product" },
  { field: "source", label: "Source" },
];

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
    setEditingId(null);
    setFormField(field);
    setFormValue("");
    setFormLabel("");
    setFormSort(0);
    setOpen(true);
  }

  function openEdit(opt: any) {
    setEditingId(opt.id);
    setFormField(opt.field);
    setFormValue(opt.value);
    setFormLabel(opt.label || "");
    setFormSort(opt.sortOrder);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      updateMut.mutate({ id: editingId, value: formValue, label: formLabel || null, sortOrder: formSort });
    } else {
      createMut.mutate({ field: formField, value: formValue, label: formLabel || undefined, sortOrder: formSort });
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-6">Field Options</h2>
      <p className="text-sm text-zinc-400 mb-6">
        Manage dropdown values for the Upload Queue. Changes take effect immediately.
      </p>

      <div className="space-y-8">
        {FIELD_GROUPS.map((group) => {
          const fieldOpts = options.filter((o) => o.field === group.field);
          return (
            <div key={group.field} className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80">
                <h3 className="text-sm font-medium">{group.label}</h3>
                <button
                  onClick={() => openCreate(group.field)}
                  className="flex items-center gap-1.5 text-xs text-brand hover:text-brand-light"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {fieldOpts.map((opt) => (
                  <div key={opt.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-900/40">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-brand">{opt.value}</span>
                      {opt.label && <span className="text-sm text-zinc-400">({opt.label})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleMut.mutate({ id: opt.id, isActive: !opt.isActive })}
                        className={`px-2 py-0.5 text-xs rounded-full border ${opt.isActive ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"}`}
                      >
                        {opt.isActive ? "Active" : "Inactive"}
                      </button>
                      <button onClick={() => openEdit(opt)} className="p-1 text-zinc-400 hover:text-zinc-100">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteMut.mutate({ id: opt.id })} className="p-1 text-zinc-400 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {fieldOpts.length === 0 && (
                  <div className="px-4 py-3 text-sm text-zinc-500">No options configured.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingId ? "Edit Option" : "Add Option"}</h3>
              <button type="button" onClick={() => setOpen(false)}><X className="w-5 h-5 text-zinc-400" /></button>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Field</label>
              <input type="text" value={formField} disabled className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-400" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Value (slug)</label>
              <input type="text" value={formValue} onChange={(e) => setFormValue(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Label (display name)</label>
              <input type="text" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Sort Order</label>
              <input type="number" value={formSort} onChange={(e) => setFormSort(Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-zinc-400">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light">{editingId ? "Update" : "Create"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
