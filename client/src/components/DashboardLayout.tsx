import { NavLink, Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Inbox,
  Send,
  Globe,
  History,
  BookOpen,
  Settings,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";

const FOCUS_VIEWS = [
  { icon: Inbox, label: "Inbox", key: "inbox", accent: "#f59e0b" },
  { icon: Send, label: "Queue", key: "queue", accent: "#3b82f6" },
  { icon: Globe, label: "Live", key: "live", accent: "#10b981" },
];

const OTHER_NAV = [
  { icon: History, label: "Upload History", path: "/history" },
  { icon: BookOpen, label: "Naming & Config", path: "/naming-config" },
  { icon: Settings, label: "Meta Settings", path: "/settings" },
];

function NavItem({ icon: Icon, label, path }: { icon: any; label: string; path: string }) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-[7px] text-[11px] font-medium transition-all duration-100 rounded-sm ${
          isActive ? "border-l-2 border-[#0099C6] pl-[9px]" : "border-l-2 border-transparent"
        }`
      }
      style={({ isActive }) =>
        isActive
          ? { background: "rgba(0,153,198,0.08)", color: "var(--text-primary)" }
          : { color: "var(--text-secondary)" }
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? "#0099C6" : undefined }} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export default function DashboardLayout({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isHome = location.pathname === "/";
  const currentView = searchParams.get("view") || "inbox";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--surface-0)", color: "var(--text-primary)" }}>
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 flex flex-col" style={{ background: "var(--surface-1)", borderRight: "1px solid var(--surface-3)" }}>

        {/* Logo */}
        <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--surface-3)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-6 h-6 flex items-center justify-center flex-shrink-0 rounded-sm"
              style={{ background: "linear-gradient(135deg, #0099C6 0%, #255C9E 100%)" }}
            >
              <span className="text-[10px] font-bold text-white" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>K</span>
            </div>
            <div className="leading-none">
              <h1 className="text-[13px] font-semibold leading-none" style={{ fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: "-0.01em" }}>
                <span style={{ color: "#60A7C8" }}>Korrus</span>{" "}
                <span style={{ color: "var(--text-primary)" }}>Ads</span>
              </h1>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {/* Focus view section */}
          <p
            className="px-2.5 pt-1 pb-2 text-[9px] font-semibold uppercase"
            style={{ letterSpacing: "0.1em", color: "var(--text-muted)" }}
          >
            Upload Queue
          </p>
          <div className="space-y-px mb-3">
            {FOCUS_VIEWS.map((view) => {
              const isActive = isHome && currentView === view.key;
              return (
                <Link
                  key={view.key}
                  to={`/?view=${view.key}`}
                  className={`flex items-center gap-2.5 px-2.5 py-[7px] text-[11px] font-medium transition-all duration-100 rounded-sm ${
                    isActive ? "border-l-2 pl-[9px]" : "border-l-2 border-transparent"
                  }`}
                  style={
                    isActive
                      ? { borderColor: view.accent, background: `${view.accent}0d`, color: "var(--text-primary)" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  <view.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? view.accent : undefined }} />
                  {view.label}
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          <div className="mx-2.5 mb-3" style={{ borderTop: "1px solid var(--surface-3)" }} />

          {/* Other nav items */}
          <div className="space-y-px">
            {OTHER_NAV.map((item) => (
              <NavItem key={item.path} {...item} />
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 space-y-2" style={{ borderTop: "1px solid var(--surface-3)" }}>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#3fb950", boxShadow: "0 0 4px #3fb950aa" }} />
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Live · v1.0</span>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-[11px] transition-colors"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
