import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Boxes, AlertOctagon, Waves, Container, Database,
  Rocket, GitBranch, MessageSquareCode, ListTree, Bell, ShieldCheck,
  LogOut, Search, ChevronsLeft, Activity, Sparkles,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import CommandPalette from "@/components/CommandPalette";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, id: "overview" },
  { to: "/services", label: "Services", icon: Boxes, id: "services" },
  { to: "/incidents", label: "Incidents", icon: AlertOctagon, id: "incidents" },
  { to: "/kafka", label: "Kafka", icon: Waves, id: "kafka" },
  { to: "/kubernetes", label: "Kubernetes", icon: Container, id: "kubernetes" },
  { to: "/database", label: "Database", icon: Database, id: "database" },
  { to: "/deployments", label: "Deployments", icon: Rocket, id: "deployments" },
  { to: "/tracing", label: "Tracing", icon: GitBranch, id: "tracing" },
  { to: "/timeline", label: "Timeline", icon: ListTree, id: "timeline" },
  { to: "/copilot", label: "AI Copilot", icon: Sparkles, id: "copilot" },
  { to: "/notifications", label: "Alerts", icon: Bell, id: "notifications" },
  { to: "/admin", label: "Admin", icon: ShieldCheck, id: "admin", requiresRole: ["ADMIN"] },
];

export default function AppLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [nowTick, setNowTick] = useState(new Date());
  const { user, logout } = useAuth();
  const location = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = NAV.filter((n) => !n.requiresRole || n.requiresRole.includes(user?.role));

  return (
    <div className="flex min-h-screen w-full text-zinc-100" style={{ background: "var(--bg)" }}>
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-[var(--border)] transition-[width] duration-200 ease-in-out",
          collapsed ? "w-[68px]" : "w-[236px]",
        )}
        style={{ background: "var(--surface-1)" }}
        data-testid="app-sidebar"
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-[var(--border)]">
          <div className="w-7 h-7 rounded-sm flex items-center justify-center" style={{ background: "linear-gradient(135deg,#10b981,#06b6d4)" }}>
            <Activity className="w-4 h-4 text-black" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-heading font-semibold tracking-tight">SENTINEL AI</span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider">v1.0 · PROD</span>
            </div>
          )}
        </div>
        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {filtered.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={`nav-${n.id}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-sm text-[13px] font-medium row-hover",
                  isActive
                    ? "bg-[var(--surface-3)] text-white border-l-2 border-emerald-500 pl-[10px]"
                    : "text-zinc-400 hover:text-zinc-100",
                )
              }
            >
              <n.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{n.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--border)] p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 text-xs gap-2 py-1.5 rounded-sm hover:bg-white/5 transition-colors"
            data-testid="sidebar-toggle"
          >
            <ChevronsLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-14 border-b border-[var(--border)] flex items-center justify-between px-6"
          style={{ background: "var(--surface-1)" }}
          data-testid="app-header"
        >
          <div className="flex items-center gap-4 text-[12px] text-zinc-500 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" style={{ color: "#10b981" }} />
              <span>PRODUCTION</span>
              <span className="text-zinc-700">·</span>
              <span>us-east-1 / us-west-2 / eu-west-1</span>
            </div>
            <div className="hidden md:block text-zinc-700">·</div>
            <div className="hidden md:block">
              {nowTick.toISOString().replace("T", " ").slice(0, 19)} UTC
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                // Simulate Ctrl/Cmd+K keypress to open palette
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
              }}
              className="hidden md:flex items-center gap-2 text-xs text-zinc-400 border border-[var(--border)] rounded-sm px-3 py-1.5 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors"
              data-testid="header-search"
            >
              <Search className="w-3.5 h-3.5" />
              Ask Sentinel AI…
              <span className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1 ml-2 font-mono">⌘K</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right leading-tight hidden md:block">
                <div className="text-xs font-medium">{user?.full_name || user?.username}</div>
                <div className="text-[10px] text-zinc-500 font-mono tracking-wider">{user?.role}</div>
              </div>
              <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-emerald-500 to-cyan-500 text-black text-xs font-mono font-bold flex items-center justify-center">
                {(user?.full_name || user?.username || "U").slice(0, 2).toUpperCase()}
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                title="Logout"
                data-testid="logout-button"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-noise" key={location.pathname}>
          <div className="animate-in-up">{children}</div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
