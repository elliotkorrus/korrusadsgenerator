import { trpc } from "../lib/trpc";
import { RefreshCw } from "lucide-react";

export default function UploadHistory() {
  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.queue.list.useQuery({
    status: undefined,
  });

  // Filter to only uploaded and error items
  const historyItems = items.filter(
    (i) => i.status === "uploaded" || i.status === "error"
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Upload History</h2>
        <button
          onClick={() => utils.queue.list.invalidate()}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:bg-zinc-800"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Ad Name</th>
              <th className="text-left px-4 py-3">Format</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Product</th>
              <th className="text-left px-4 py-3">Dims</th>
              <th className="text-left px-4 py-3">Ad Set</th>
              <th className="text-left px-4 py-3">Meta Ad ID</th>
              <th className="text-left px-4 py-3">Error</th>
              <th className="text-left px-4 py-3">Uploaded At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {historyItems.map((item) => (
              <tr key={item.id} className="hover:bg-zinc-900/40">
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs rounded-full border ${
                      item.status === "uploaded"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[300px] truncate font-mono text-xs" title={item.generatedAdName}>
                  {item.generatedAdName}
                </td>
                <td className="px-4 py-3">{item.contentType}</td>
                <td className="px-4 py-3">{item.creativeType}</td>
                <td className="px-4 py-3">{item.product}</td>
                <td className="px-4 py-3">{item.dimensions}</td>
                <td className="px-4 py-3 text-zinc-400" title={item.adSetId || ""}>
                  {item.adSetName || item.adSetId || "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {item.metaAdId || "—"}
                </td>
                <td className="px-4 py-3 text-red-400 max-w-[200px] truncate" title={item.errorMessage || ""}>
                  {item.errorMessage || "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">{item.uploadedAt || "—"}</td>
              </tr>
            ))}
            {historyItems.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                  No upload history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
