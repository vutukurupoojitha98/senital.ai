import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { authApi } from "@/lib/api";
import { StatusDot } from "@/components/StatusDot";
import { relTime, severityColor } from "@/lib/utils";
import { ArrowLeft, Sparkles, Loader2, GitCommit, Waves, Container, Database, Bell, Wrench, CheckCircle2 } from "lucide-react";

const iconFor = (t) => ({
  deployment: GitCommit,
  kafka: Waves,
  k8s_event: Container,
  db: Database,
  alert: Bell,
  notification: Bell,
  mitigation: Wrench,
  resolution: CheckCircle2,
  database: Database,
  kafka_lag: Waves,
}[t] || Bell);

export default function IncidentDetailPage() {
  const { id } = useParams();
  const [inc, setInc] = useState(null);
  const [rca, setRca] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authApi.get(`/incidents/${id}`).then((r) => setInc(r.data));
  }, [id]);

  const runRca = async () => {
    setLoading(true);
    setRca("");
    try {
      const { data } = await authApi.post(`/copilot/rca/${id}`);
      setRca(data.root_cause);
    } catch (e) {
      setRca("Failed to generate RCA: " + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  if (!inc) return <div className="p-8 text-zinc-500 text-sm font-mono">Loading incident…</div>;

  return (
    <div className="p-6 space-y-4" data-testid="incident-detail-page">
      <Link to="/incidents" className="text-xs text-zinc-500 hover:text-zinc-200 flex items-center gap-1 font-mono">
        <ArrowLeft className="w-3.5 h-3.5" /> All incidents
      </Link>

      <div className="card-tech p-5">
        <div className="flex items-start gap-3">
          <span className={`text-xs font-mono px-2 py-0.5 rounded-sm border ${severityColor[inc.severity]}`}>{inc.severity}</span>
          <div className="flex-1">
            <h1 className="font-heading text-xl tracking-tight">{inc.title}</h1>
            <div className="text-xs text-zinc-500 font-mono mt-1 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5"><StatusDot status={inc.status} size={6} /> {inc.status}</span>
              <span>service: {inc.service}</span>
              <span>opened {relTime(inc.opened_at)}</span>
              <span>detected by {inc.detected_by}</span>
              <span>impact: {inc.impact}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="overline">AI conf</div>
            <div className="font-mono text-cyan-300 mt-1 text-lg">{(inc.ai_confidence * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Root cause */}
        <div className="card-tech p-4 lg:col-span-2 space-y-3" data-testid="rca-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <div className="overline">AI root-cause analysis</div>
            </div>
            <button
              onClick={runRca}
              disabled={loading}
              data-testid="run-rca"
              className="text-[11px] px-2.5 py-1 border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 rounded-sm hover:bg-cyan-500/20 flex items-center gap-1 font-mono disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {loading ? "Analyzing…" : rca ? "Regenerate" : "Generate RCA"}
            </button>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-300 min-h-[120px]" data-testid="rca-content">
            {rca || <span className="text-zinc-500 text-xs font-mono">Click "Generate RCA" to have Sentinel AI correlate deploys, Kafka lag, K8s events, database pressure and produce an evidence-based root cause with recommended mitigation.</span>}
          </div>
        </div>

        {/* Correlated events */}
        <div className="card-tech p-4 space-y-3">
          <div className="overline">Correlated signals</div>
          <div className="space-y-2">
            {(inc.correlated_events || []).map((e, idx) => {
              const Icon = iconFor(e.type);
              return (
                <div key={`${e.type}-${e.at}-${idx}`} className="border-l-2 border-cyan-500/40 pl-3 py-1">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                    <Icon className="w-3 h-3" /> {e.type.replace("_", " ")}
                  </div>
                  <div className="text-xs text-zinc-200 mt-0.5">{e.summary}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card-tech p-4">
        <div className="overline mb-4">Incident timeline</div>
        <div className="relative pl-8" data-testid="incident-timeline">
          <div className="absolute left-3 top-1 bottom-1 w-px bg-[var(--border)]" />
          {(inc.timeline || []).map((s, idx) => {
            const Icon = iconFor(s.type);
            return (
              <div key={`${s.type}-${s.at}-${idx}`} className="relative mb-4 last:mb-0">
                <div className="absolute -left-6 top-0 w-6 h-6 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
                  <Icon className="w-3 h-3 text-cyan-400" />
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="text-xs font-medium">{s.title}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{new Date(s.at).toISOString().replace("T", " ").slice(0, 19)} UTC</div>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5 font-mono">{s.detail}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
