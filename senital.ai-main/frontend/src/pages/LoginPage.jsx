import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Activity, Loader2, ShieldCheck } from "lucide-react";

const SEED = [
  { u: "admin", p: "admin123", role: "ADMIN", name: "System Admin" },
  { u: "sre", p: "sre123", role: "SRE", name: "Priya Sharma" },
  { u: "developer", p: "dev123", role: "DEVELOPER", name: "Marco Rossi" },
  { u: "viewer", p: "viewer123", role: "VIEWER", name: "Chen Wei" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(username, password);
      nav("/");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const fillAndLogin = async (u, p) => {
    setUsername(u);
    setPassword(p);
    setErr("");
    setLoading(true);
    try {
      await login(u, p);
      nav("/");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)" }} data-testid="login-page">
      {/* Left panel - brand */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 relative overflow-hidden border-r border-[var(--border)]">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos/17489157/pexels-photo-17489157.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at bottom left, rgba(16,185,129,0.15), transparent 50%), radial-gradient(ellipse at top right, rgba(6,182,212,0.15), transparent 50%), linear-gradient(180deg, rgba(14,14,16,0.6), rgba(14,14,16,0.95))",
          }}
        />
        <div className="relative z-10 p-12">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-sm flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#10b981,#06b6d4)" }}
            >
              <Activity className="w-5 h-5 text-black" />
            </div>
            <div className="leading-tight">
              <div className="font-heading font-semibold text-lg tracking-tight">SENTINEL AI</div>
              <div className="text-[10px] text-zinc-500 font-mono tracking-widest">
                AUTONOMOUS PRODUCTION INTELLIGENCE
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 p-12 max-w-lg">
          <h1 className="font-heading text-4xl leading-[1.05] tracking-tight text-white">
            The autonomous SRE that
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              detects, correlates, and explains
            </span>
            production incidents in seconds.
          </h1>
          <p className="mt-6 text-sm text-zinc-400 leading-relaxed">
            Unified observability across microservices, Kafka, Kubernetes, PostgreSQL and deployment
            pipelines — powered by an LLM copilot trained on your live telemetry.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              ["MTTR", "-72%"],
              ["Signals", "142K/s"],
              ["Services", "1,240"],
            ].map(([k, v]) => (
              <div key={k} className="border-l-2 border-emerald-500/50 pl-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-heading">{k}</div>
                <div className="font-mono text-xl mt-1">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 p-8 text-[11px] text-zinc-600 font-mono flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          SOC 2 Type II · ISO 27001 · GDPR · HIPAA-ready
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div
              className="w-9 h-9 rounded-sm flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#10b981,#06b6d4)" }}
            >
              <Activity className="w-5 h-5 text-black" />
            </div>
            <div className="font-heading font-semibold text-lg">SENTINEL AI</div>
          </div>
          <div className="mb-6">
            <div className="overline mb-2">Operator sign-in</div>
            <h2 className="font-heading text-2xl tracking-tight">Access the platform</h2>
            <p className="text-sm text-zinc-500 mt-1">JWT-authenticated · role-based access control</p>
          </div>

          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="overline block mb-2">Username</label>
              <input
                data-testid="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="w-full px-3 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-sm text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="overline block mb-2">Password</label>
              <input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3 py-2.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-sm text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
            {err && (
              <div
                data-testid="login-error"
                className="text-xs text-red-400 border border-red-500/40 bg-red-500/10 px-3 py-2 rounded-sm font-mono"
              >
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-sm text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Authenticating…" : "Sign in"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            <div className="overline mb-3">Demo access — one-click sign-in</div>
            <div className="grid grid-cols-2 gap-2">
              {SEED.map((s) => (
                <button
                  key={s.u}
                  onClick={() => fillAndLogin(s.u, s.p)}
                  disabled={loading}
                  data-testid={`quick-login-${s.u}`}
                  className="text-left p-2.5 border border-[var(--border)] rounded-sm hover:border-emerald-500/50 hover:bg-white/5 transition-colors"
                >
                  <div className="text-xs font-medium">{s.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                    {s.u} / {s.p}
                  </div>
                  <div className="text-[9px] font-heading tracking-widest text-cyan-400 mt-1">{s.role}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
