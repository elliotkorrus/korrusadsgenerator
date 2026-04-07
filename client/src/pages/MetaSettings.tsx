import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { useToast } from "../components/Toast";

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

const inputClass = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none font-mono";
const inputStyle: React.CSSProperties = {
  background: "var(--surface-0)",
  border: "1px solid var(--surface-2)",
  color: "var(--text-primary)",
};

export default function MetaSettings() {
  const toast = useToast();
  const { data: settings } = trpc.meta.get.useQuery();
  const updateMut = trpc.meta.update.useMutation({
    onSuccess: () => { toast.success("Settings saved"); },
    onError: (err) => { toast.error("Failed to save settings", err.message); },
  });

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
    <div className="p-6 max-w-2xl" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Meta Settings</h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>API credentials and upload defaults for Meta Ads Manager.</p>

      <form onSubmit={handleSave} className="space-y-6">
        {/* API Credentials */}
        <div className="rounded-lg p-5 space-y-4" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-2)", boxShadow: "var(--shadow-sm)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>API Credentials</h3>
          {[
            { key: "appId", label: "App ID", sensitive: false },
            { key: "appSecret", label: "App Secret", sensitive: true },
            { key: "accessToken", label: "Access Token", sensitive: true },
            { key: "adAccountId", label: "Ad Account ID", sensitive: false, placeholder: "act_XXXXXXXXX" },
            { key: "pageId", label: "Page ID", sensitive: false },
          ].map(({ key, label, sensitive, placeholder }) => (
            <div key={key}>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{label}</label>
              <input
                type={sensitive ? "password" : "text"}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={placeholder || label}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        {/* Upload Defaults */}
        <div className="rounded-lg p-5 space-y-4" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-2)", boxShadow: "var(--shadow-sm)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Upload Defaults</h3>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            These values auto-populate new ads. Each ad can override them individually.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Instagram User ID</label>
              <input
                type="text"
                value={form.instagramUserId}
                onChange={(e) => setForm({ ...form, instagramUserId: e.target.value })}
                placeholder="17841456289857293"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Instagram Handle</label>
              <input
                type="text"
                value={form.instagramHandle}
                onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
                placeholder="korruscircadian"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Default Destination URL</label>
            <input
              type="text"
              value={form.defaultDestinationUrl}
              onChange={(e) => setForm({ ...form, defaultDestinationUrl: e.target.value })}
              placeholder="https://www.korrus.com/collections/store"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Default Display Link</label>
              <input
                type="text"
                value={form.defaultDisplayUrl}
                onChange={(e) => setForm({ ...form, defaultDisplayUrl: e.target.value })}
                placeholder="korrus.com"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Default CTA</label>
              <select
                value={form.defaultCta}
                onChange={(e) => setForm({ ...form, defaultCta: e.target.value })}
                className={inputClass}
                style={inputStyle}
              >
                {CTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>UTM Template</label>
            <textarea
              value={form.utmTemplate}
              onChange={(e) => setForm({ ...form, utmTemplate: e.target.value })}
              placeholder="utm_source=facebook&utm_medium=paidsocial&utm_campaign={{campaign.name}}..."
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none font-mono leading-relaxed"
              style={inputStyle}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Use {"{{...}}"} for Meta dynamic macros. This is appended to destination URLs on upload.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 text-white rounded-lg text-sm font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, #0099C6, #255C9E)", boxShadow: "0 1px 3px rgba(0,153,198,0.25)" }}
          >
            {updateMut.isPending ? "Saving..." : "Save Settings"}
          </button>
          {updateMut.isSuccess && (
            <span className="text-sm text-green-600 py-2">Saved!</span>
          )}
        </div>
      </form>

      {/* Token Validation */}
      <div className="mt-8 rounded-lg p-5" style={{ background: "var(--surface-1)", border: "1px solid var(--surface-2)", boxShadow: "var(--shadow-sm)" }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Token Validation</h3>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Token validation and account info will be available once Meta API integration is connected.
        </p>
        <button
          disabled
          className="mt-3 px-4 py-2 rounded-lg text-sm cursor-not-allowed"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
        >
          Validate Token (Coming Soon)
        </button>
      </div>
    </div>
  );
}
