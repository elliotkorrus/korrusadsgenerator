import { NavLink } from "react-router-dom";
import {
  Upload,
  History,
  BookOpen,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { icon: Upload, label: "Upload Queue", path: "/" },
  { icon: History, label: "Upload History", path: "/history" },
  { icon: BookOpen, label: "Naming & Config", path: "/naming-config" },
  { icon: Settings, label: "Meta Settings", path: "/settings" },
];

function NavItem({ icon: Icon, label, path }: { icon: any; label: string; path: string }) {
  return (
    <NavLink
      to={path}
      end={path === "/"}
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

export default function DashboardLayout({ children }: { children: ReactNode }) {
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
        <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-px">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3" style={{ borderTop: "1px solid var(--surface-3)" }}>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#3fb950", boxShadow: "0 0 4px #3fb950aa" }} />
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Live · v1.0</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
