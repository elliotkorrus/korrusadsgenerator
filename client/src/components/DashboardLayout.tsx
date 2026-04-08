import { NavLink, Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Inbox,
  Send,
  Globe,
  History,
  BookOpen,
  Settings,
  LogOut,
  Users,
  TrendingUp,
  Calendar,
} from "lucide-react";
import type { ReactNode } from "react";
import TokenExpiryBanner from "./TokenExpiryBanner";

const FOCUS_VIEWS = [
  { icon: Inbox, label: "Inbox", key: "inbox", accent: "#f59e0b" },
  { icon: Send, label: "Queue", key: "queue", accent: "#3b82f6" },
  { icon: Globe, label: "Live", key: "live", accent: "#10b981" },
];

const OTHER_NAV = [
  { icon: History, label: "Upload History", path: "/history" },
  { icon: TrendingUp, label: "Performance", path: "/performance" },
  { icon: Calendar, label: "Scheduled", path: "/scheduled" },
  { icon: Users, label: "Handle Bank", path: "/handles" },
  { icon: BookOpen, label: "Naming & Config", path: "/naming-config" },
  { icon: Settings, label: "Meta Settings", path: "/settings" },
];

function NavItem({ icon: Icon, label, path }: { icon: any; label: string; path: string }) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-[8px] font-medium transition-all duration-100 rounded-sm ${
          isActive ? "text-[12px] border-l-2 border-[#0099C6] pl-[9px]" : "text-[11px] border-l-2 border-transparent"
        }`
      }
      style={({ isActive }) =>
        isActive
          ? { background: "rgba(0,153,198,0.08)", color: "var(--text-primary)", boxShadow: "0 0 8px rgba(0,153,198,0.12)" }
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
      <aside className="w-48 flex-shrink-0 flex flex-col" style={{ background: "var(--surface-1)", boxShadow: "inset -1px 0 0 var(--surface-3), 2px 0 8px rgba(0,0,0,0.03)" }}>

        {/* Logo */}
        <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--surface-3)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 flex items-center justify-center flex-shrink-0 rounded-sm"
              style={{ background: "#0099C6" }}
            >
              <span className="text-[11px] font-bold text-white" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>K</span>
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
          <div className="px-2.5 pt-1 pb-2 flex items-center gap-2">
            <p
              className="text-[9px] font-semibold uppercase whitespace-nowrap"
              style={{ letterSpacing: "0.1em", color: "var(--text-muted)" }}
            >
              Upload Queue
            </p>
            <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, var(--surface-3), transparent)" }} />
          </div>
          <div className="space-y-px mb-3">
            {FOCUS_VIEWS.map((view) => {
              const isActive = isHome && currentView === view.key;
              return (
                <Link
                  key={view.key}
                  to={`/?view=${view.key}`}
                  className={`flex items-center gap-2.5 px-2.5 py-[8px] font-medium transition-all duration-100 rounded-sm ${
                    isActive ? "text-[12px] border-l-2 pl-[9px]" : "text-[11px] border-l-2 border-transparent"
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
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#3fb950" }} />
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Live · v1.0</span>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 w-full px-2 py-1 rounded-sm text-[10px] transition-colors"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", opacity: 0.7 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f85149"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.04)"; (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
            >
              <LogOut className="w-2.5 h-2.5" /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TokenExpiryBanner />
        <main className="flex-1 min-w-0 overflow-auto" style={{ background: "var(--surface-0)" }}>{children}</main>
      </div>
    </div>
  );
}
