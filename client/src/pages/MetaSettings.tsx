import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";

const CTA_OPTIONS = [
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "ORDER_NOW", label: "Order Now" },
  { value: "BOOK_NOW", label: "Book Now" },
  { value: "NO_BUTTON", label: "No Button" },
];

export default function MetaSettings() {
  const { data: settings } = trpc.meta.get.useQuery();
  const updateMut = trpc.meta.update.useMutation();

  const [form, setForm] = useState({
    appId: "",
    appSecret: "",
    accessToken: "",
    adAccountId: "",
    pageId: "",
    instagramUserId: "",
    instagramHandle: "",
    defaultDestinationUrl: "",
    defaultDisplayUrl: "",
    defaultCta: "SHOP_NOW",
    utmTemplate: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        appId: settings.appId || "",
        appSecret: settings.appSecret || "",
        accessToken: settings.accessToken || "",
        adAccountId: settings.adAccountId || "",
        pageId: settings.pageId || "",
        instagramUserId: settings.instagramUserId || "",
        instagramHandle: settings.instagramHandle || "",
        defaultDestinationUrl: settings.defaultDestinationUrl || "",
        defaultDisplayUrl: settings.defaultDisplayUrl || "",
        defaultCta: settings.defaultCta || "SHOP_NOW",
        utmTemplate: settings.utmTemplate || "",
      });
    }
  }, [settings]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMut.mutate(form);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Meta Settings</h2>

      <form onSubmit={handleSave} className="space-y-6">
        {/* API Credentials */}
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
        </div>

        {/* Upload Defaults */}
        <div className="border border-zinc-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-medium text-zinc-300">Upload Defaults</h3>
          <p className="text-xs text-zinc-500">
            These values auto-populate new ads. Each ad can override them individually.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Instagram User ID</label>
              <input
                type="text"
                value={form.instagramUserId}
                onChange={(e) => setForm({ ...form, instagramUserId: e.target.value })}
                placeholder="17841456289857293"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Instagram Handle</label>
              <input
                type="text"
                value={form.instagramHandle}
                onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
                placeholder="korruscircadian"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Default Destination URL</label>
            <input
              type="text"
              value={form.defaultDestinationUrl}
              onChange={(e) => setForm({ ...form, defaultDestinationUrl: e.target.value })}
              placeholder="https://www.korrus.com/collections/store"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Default Display Link</label>
              <input
                type="text"
                value={form.defaultDisplayUrl}
                onChange={(e) => setForm({ ...form, defaultDisplayUrl: e.target.value })}
                placeholder="korrus.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Default CTA</label>
              <select
                value={form.defaultCta}
                onChange={(e) => setForm({ ...form, defaultCta: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
              >
                {CTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">UTM Template</label>
            <textarea
              value={form.utmTemplate}
              onChange={(e) => setForm({ ...form, utmTemplate: e.target.value })}
              placeholder="utm_source=facebook&utm_medium=paidsocial&utm_campaign={{campaign.name}}..."
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand font-mono leading-relaxed"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              Use {"{{...}}"} for Meta dynamic macros. This is appended to destination URLs on upload.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
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
      </form>

      {/* Token Validation */}
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
