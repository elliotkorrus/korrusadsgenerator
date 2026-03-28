import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { buildUtmUrl } from "@shared/naming";

export default function MetaSettings() {
  const { data: settings } = trpc.meta.get.useQuery();
  const updateMut = trpc.meta.update.useMutation();

  const [form, setForm] = useState({
    appId: "",
    appSecret: "",
    accessToken: "",
    adAccountId: "",
    pageId: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        appId: settings.appId || "",
        appSecret: settings.appSecret || "",
        accessToken: settings.accessToken || "",
        adAccountId: settings.adAccountId || "",
        pageId: settings.pageId || "",
      });
    }
  }, [settings]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMut.mutate(form);
  }

  function mask(val: string) {
    if (!val || val.length <= 8) return val;
    return "*".repeat(val.length - 8) + val.slice(-8);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Meta Settings</h2>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="border border-zinc-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-medium text-zinc-300">API Credentials</h3>
          {[
            { key: "appId", label: "App ID", sensitive: false },
            { key: "appSecret", label: "App Secret", sensitive: true },
            { key: "accessToken", label: "Access Token", sensitive: true },
            { key: "adAccountId", label: "Ad Account ID", sensitive: false, placeholder: "act_XXXXXXXXX" },
            { key: "pageId", label: "Page ID", sensitive: false },
          ].map(({ key, label, sensitive, placeholder }) => (
            <div key={key}>
              <label className="block text-xs text-zinc-400 mb-1">{label}</label>
              <input
                type={sensitive ? "password" : "text"}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={placeholder || label}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand font-mono"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-light"
            >
              {updateMut.isPending ? "Saving..." : "Save Settings"}
            </button>
            {updateMut.isSuccess && (
              <span className="text-sm text-green-400 py-2">Saved!</span>
            )}
          </div>
        </div>
      </form>

      {/* UTM Template */}
      <div className="mt-8 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">UTM Template</h3>
        <p className="text-xs text-zinc-500 mb-2">
          This URL template is used for all ad destination URLs. The {"{{...}}"} tokens are Meta dynamic macros.
        </p>
        <code className="block text-xs text-zinc-400 bg-zinc-800 p-3 rounded-lg break-all font-mono leading-relaxed">
          {buildUtmUrl()}
        </code>
      </div>

      {/* TODO stub */}
      <div className="mt-8 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Token Validation</h3>
        <p className="text-sm text-zinc-500">
          Token validation and account info will be available once Meta API integration is connected.
        </p>
        <button
          disabled
          className="mt-3 px-4 py-2 bg-zinc-800 text-zinc-500 rounded-lg text-sm cursor-not-allowed"
        >
          Validate Token (Coming Soon)
        </button>
      </div>
    </div>
  );
}
