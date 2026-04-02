import { useState } from "react";

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/trpc/meta.get", {
        headers: { "x-app-token": password },
      });
      if (res.status === 401) {
        setError(true);
      } else {
        localStorage.setItem("app-token", password);
        onSuccess();
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)", fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-8 space-y-6"
        style={{ background: "var(--surface-1)", border: "1px solid var(--surface-3)", boxShadow: "0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #0099C6 0%, #255C9E 100%)" }}
          >
            <span className="text-[12px] font-bold text-white">K</span>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-none" style={{ letterSpacing: "-0.01em" }}>
              <span style={{ color: "#60A7C8" }}>Korrus</span>{" "}
              <span style={{ color: "var(--text-primary)" }}>Ads</span>
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Internal ad management</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1.5" style={{ letterSpacing: "0.08em", color: "var(--text-muted)" }}>
              Access Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="Enter password"
              autoFocus
              className="w-full px-3 py-2.5 text-sm rounded-md focus:outline-none"
              style={{
                background: "var(--surface-0)",
                border: `1px solid ${error ? "rgba(248,81,73,0.5)" : "var(--surface-3)"}`,
                color: "var(--text-primary)",
              }}
              onFocus={(e) => { if (!error) (e.target as HTMLInputElement).style.borderColor = "rgba(0,153,198,0.5)"; }}
              onBlur={(e) => { if (!error) (e.target as HTMLInputElement).style.borderColor = "var(--surface-3)"; }}
            />
            {error && (
              <p className="text-[11px] mt-1.5" style={{ color: "#f85149" }}>Incorrect password</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 text-sm font-semibold rounded-md transition-all"
            style={{
              background: loading || !password ? "rgba(0,153,198,0.4)" : "linear-gradient(135deg, #0099C6, #255C9E)",
              color: "white",
              border: "none",
              cursor: loading || !password ? "not-allowed" : "pointer",
              opacity: !password ? 0.6 : 1,
            }}
          >
            {loading ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
