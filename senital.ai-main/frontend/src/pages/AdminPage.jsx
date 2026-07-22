import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { ShieldCheck, Plus, Trash2, Loader2 } from "lucide-react";
import { relTime } from "@/lib/utils";
import { toast } from "sonner";

const ROLES = ["ADMIN", "SRE", "DEVELOPER", "VIEWER"];
const TAB_KEYS = ["users", "thresholds", "ai", "audit"];

export default function AdminPage() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [thresholds, setThresholds] = useState({});
  const [ai, setAi] = useState({});
  const [audit, setAudit] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", full_name: "", password: "", role: "DEVELOPER" });

  const load = async () => {
    try {
      const [u, t, a, l] = await Promise.all([
        authApi.get("/admin/users"),
        authApi.get("/admin/thresholds"),
        authApi.get("/admin/ai-settings"),
        authApi.get("/admin/audit-log"),
      ]);
      setUsers(u.data);
      setThresholds(t.data);
      setAi(a.data);
      setAudit(l.data);
    } catch (e) {
      toast.error("Admin access required");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await authApi.post("/admin/users", form);
      toast.success("User created");
      setShowAdd(false);
      setForm({ username: "", email: "", full_name: "", password: "", role: "DEVELOPER" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const deleteUser = async (u) => {
    await authApi.delete(`/admin/users/${u}`);
    toast.success("User deleted");
    load();
  };

  const updateThreshold = async (key, value) => {
    await authApi.patch("/admin/thresholds", { key, value: parseFloat(value) });
    toast.success(`${key} updated`);
    load();
  };

  const updateAi = async (field, value) => {
    await authApi.patch("/admin/ai-settings", { [field]: value });
    toast.success(`AI ${field} updated`);
    load();
  };

  return (
    <div className="p-6 space-y-4" data-testid="admin-page">
      <div>
        <div className="overline">Platform administration</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-cyan-400" />
          Admin Console
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">Users · RBAC · thresholds · AI settings · audit trail</p>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)]">
        {TAB_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`admin-tab-${k}`}
            className={`px-3 py-2 text-xs font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors ${
              tab === k ? "border-emerald-500 text-emerald-400" : "border-transparent text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="card-tech overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="overline">Users · {users.length}</div>
            <button
              onClick={() => setShowAdd((v) => !v)}
              data-testid="new-user"
              className="text-[11px] px-2.5 py-1 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 rounded-sm flex items-center gap-1 font-mono hover:bg-emerald-500/20 transition-colors"
            >
              <Plus className="w-3 h-3" /> New user
            </button>
          </div>
          {showAdd && (
            <form onSubmit={createUser} className="p-4 border-b border-[var(--border)] grid grid-cols-2 md:grid-cols-5 gap-2 text-xs" data-testid="new-user-form">
              <input required placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono" />
              <input required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono" />
              <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono" />
              <input required type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono" />
              <div className="flex gap-2">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="flex-1 px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono">
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <button type="submit" className="px-3 py-1.5 bg-emerald-500 text-black rounded-sm font-mono" data-testid="save-user">Save</button>
              </div>
            </form>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
                <th className="text-left px-4 py-2 font-heading">Username</th>
                <th className="text-left px-3 py-2 font-heading">Full name</th>
                <th className="text-left px-3 py-2 font-heading">Email</th>
                <th className="text-left px-3 py-2 font-heading">Role</th>
                <th className="text-left px-3 py-2 font-heading">Active</th>
                <th className="text-right px-3 py-2 font-heading">Last login</th>
                <th className="text-right px-3 py-2 font-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username} className="border-b border-[var(--border)] row-hover" data-testid={`user-row-${u.username}`}>
                  <td className="px-4 py-2 font-mono">{u.username}</td>
                  <td className="px-3 py-2">{u.full_name}</td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{u.active ? <span className="text-emerald-400">yes</span> : <span className="text-zinc-500">no</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-500">{u.last_login ? relTime(u.last_login) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {u.username !== "admin" && (
                      <button onClick={() => deleteUser(u.username)} className="text-zinc-500 hover:text-red-400 p-1 transition-colors" data-testid={`del-user-${u.username}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "thresholds" && (
        <div className="card-tech p-6 space-y-3">
          <div className="overline">Global alerting thresholds</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(thresholds).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 border border-[var(--border)] rounded-sm p-3">
                <div className="flex-1">
                  <div className="text-xs font-medium">{k}</div>
                  <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">threshold</div>
                </div>
                <input
                  type="number"
                  defaultValue={v}
                  onBlur={(e) => updateThreshold(k, e.target.value)}
                  data-testid={`threshold-${k}`}
                  className="w-28 px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono text-right"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="card-tech p-6 space-y-4">
          <div className="overline">AI Copilot settings</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between border border-[var(--border)] rounded-sm p-3">
              <div>
                <div className="text-xs font-medium">Model</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Anthropic Claude</div>
              </div>
              <span className="font-mono text-xs text-cyan-300">{ai.model}</span>
            </div>
            <div className="flex items-center justify-between border border-[var(--border)] rounded-sm p-3">
              <div>
                <div className="text-xs font-medium">Temperature</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">0.0 - 1.0</div>
              </div>
              <input
                type="number" step="0.1" min="0" max="1"
                defaultValue={ai.temperature}
                onBlur={(e) => updateAi("temperature", parseFloat(e.target.value))}
                className="w-20 px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono text-right text-xs"
              />
            </div>
            <div className="flex items-center justify-between border border-[var(--border)] rounded-sm p-3">
              <div>
                <div className="text-xs font-medium">Auto-RCA on incident</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Automatically generate root cause</div>
              </div>
              <button
                onClick={() => updateAi("auto_rca", !ai.auto_rca)}
                data-testid="toggle-auto-rca"
                className={`text-xs px-3 py-1 rounded-sm font-mono ${ai.auto_rca ? "bg-emerald-500 text-black" : "border border-[var(--border)] text-zinc-400"}`}
              >
                {ai.auto_rca ? "ENABLED" : "DISABLED"}
              </button>
            </div>
            <div className="flex items-center justify-between border border-[var(--border)] rounded-sm p-3">
              <div>
                <div className="text-xs font-medium">Confidence threshold</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Min for auto-triage</div>
              </div>
              <input
                type="number" step="0.05" min="0" max="1"
                defaultValue={ai.confidence_threshold}
                onBlur={(e) => updateAi("confidence_threshold", parseFloat(e.target.value))}
                className="w-20 px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono text-right text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="card-tech overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] overline">Audit trail</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
                <th className="text-left px-4 py-2 font-heading">When</th>
                <th className="text-left px-3 py-2 font-heading">Actor</th>
                <th className="text-left px-3 py-2 font-heading">Action</th>
                <th className="text-left px-3 py-2 font-heading">Target</th>
                <th className="text-left px-3 py-2 font-heading">Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-[var(--border)] row-hover">
                  <td className="px-4 py-2 font-mono text-zinc-500">{new Date(a.timestamp).toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2 font-mono">{a.actor}</td>
                  <td className="px-3 py-2 font-mono text-cyan-300">{a.action}</td>
                  <td className="px-3 py-2 font-mono text-zinc-300">{a.target}</td>
                  <td className="px-3 py-2 font-mono text-zinc-500 truncate max-w-[400px]">{a.details ? JSON.stringify(a.details) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
