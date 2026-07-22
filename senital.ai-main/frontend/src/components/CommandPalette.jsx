import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command, LayoutDashboard, Boxes, AlertOctagon, Waves, Container, Database,
  Rocket, GitBranch, MessageSquareCode, ListTree, Bell, ShieldCheck, Sparkles, LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const PAGES = [
  { to: "/", label: "Overview", icon: LayoutDashboard, keywords: "dashboard kpi health" },
  { to: "/services", label: "Services", icon: Boxes, keywords: "microservices health registry" },
  { to: "/incidents", label: "Incidents", icon: AlertOctagon, keywords: "outage p1 p2 alerts" },
  { to: "/kafka", label: "Kafka", icon: Waves, keywords: "topics lag dlq consumer" },
  { to: "/kubernetes", label: "Kubernetes", icon: Container, keywords: "pods crashloop hpa cpu memory" },
  { to: "/database", label: "Database", icon: Database, keywords: "postgres slow queries index pool" },
  { to: "/deployments", label: "Deployments", icon: Rocket, keywords: "release risk github" },
  { to: "/tracing", label: "Distributed Tracing", icon: GitBranch, keywords: "spans waterfall opentelemetry" },
  { to: "/timeline", label: "Incident Timeline", icon: ListTree, keywords: "events chronology" },
  { to: "/copilot", label: "AI Copilot", icon: Sparkles, keywords: "chat ai claude" },
  { to: "/notifications", label: "Alerts & Notifications", icon: Bell, keywords: "email slack teams pagerduty" },
  { to: "/admin", label: "Admin Console", icon: ShieldCheck, keywords: "users rbac audit thresholds", role: "ADMIN" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const nav = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setActiveIdx(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pages = PAGES.filter((p) => !p.role || p.role === user?.role);
  const query = q.trim().toLowerCase();
  const matches = query
    ? pages.filter((p) => (p.label + " " + p.keywords).toLowerCase().includes(query))
    : pages;

  // custom actions
  const actions = [];
  if (query) {
    actions.push({
      type: "copilot",
      label: `Ask AI Copilot: "${q.trim()}"`,
      run: () => nav(`/copilot?q=${encodeURIComponent(q.trim())}`),
    });
  }
  actions.push({ type: "logout", label: "Sign out", run: logout });

  const items = [
    ...matches.map((p) => ({ type: "page", ...p, run: () => nav(p.to) })),
    ...actions,
  ];

  const runAt = (idx) => {
    const it = items[idx];
    if (!it) return;
    it.run();
    setOpen(false);
    setQ("");
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(activeIdx);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={() => setOpen(false)}
      data-testid="command-palette-overlay"
    >
      <div
        className="w-full max-w-xl rounded-md border shadow-2xl overflow-hidden"
        style={{ background: "#16161a", borderColor: "#2a2a30" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="command-palette"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Command className="w-4 h-4 text-cyan-400" />
          <input
            autoFocus
            data-testid="command-palette-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to page or ask AI Copilot…"
            className="flex-1 bg-transparent outline-none text-sm font-mono placeholder:text-zinc-600"
          />
          <span className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1 font-mono">ESC</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-6 text-xs text-zinc-500 font-mono">No matches.</div>
          )}
          {items.map((it, idx) => {
            const Icon = it.icon || (it.type === "copilot" ? Sparkles : LogOut);
            const isActive = idx === activeIdx;
            return (
              <button
                key={it.to || it.type + it.label}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => runAt(idx)}
                data-testid={`palette-item-${(it.to || it.type + "-" + it.label).replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${
                  isActive ? "bg-cyan-500/10 text-cyan-100" : "text-zinc-300"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-cyan-300" : "text-zinc-500"}`} />
                <span className="flex-1">{it.label}</span>
                {it.to && <span className="text-[10px] font-mono text-zinc-600">{it.to}</span>}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-[var(--border)] text-[10px] font-mono text-zinc-600 flex justify-between">
          <span>↑↓ navigate · ↵ open · ESC close</span>
          <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
