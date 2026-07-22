import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { StatusDot } from "@/components/StatusDot";
import { relTime, severityColor } from "@/lib/utils";
import { GitCommit, Rocket, Sparkles, Loader2 } from "lucide-react";

const riskColor = {
  low: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  medium: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  high: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
};

export default function DeploymentsPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ai, setAi] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authApi.get("/deployments").then((r) => {
      setItems(r.data);
      if (r.data[0]) setSelected(r.data[0]);
    });
  }, []);

  const analyze = async () => {
    if (!selected) return;
    setLoading(true);
    setAi("");
    try {
      const { data } = await authApi.post(`/copilot/deployment-risk/${selected.id}`);
      setAi(data.ai_summary);
    } catch (e) {
      setAi("Analysis failed: " + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAi("");
  }, [selected?.id]);

  return (
    <div className="p-6 space-y-4" data-testid="deployments-page">
      <div>
        <div className="overline">Release intelligence</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <Rocket className="w-6 h-6 text-cyan-400" />
          Deployment Risk Analyzer
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">GitHub Actions · ArgoCD · Blue-green + canary rollout strategies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-tech lg:col-span-2 overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] overline">Recent deployments · 14</div>
          <div className="divide-y divide-[var(--border)] max-h-[560px] overflow-y-auto">
            {items.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelected(d)}
                data-testid={`deployment-${d.commit_sha}`}
                className={`w-full text-left p-3 row-hover ${selected?.id === d.id ? "bg-[var(--surface-2)]" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <GitCommit className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{d.service}</span>
                      <span className="text-[10px] font-mono text-zinc-500">{d.version}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border uppercase tracking-wider ${riskColor[d.risk_level]}`}>
                        {d.risk_level} · {d.risk_score}
                      </span>
                      <StatusDot status={d.status} size={6} />
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono mt-1 truncate">
                      {d.commit_sha} · {d.commit_message}
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                      {d.author} · {d.files_changed} files · +{d.lines_added}/-{d.lines_removed} · {relTime(d.deployed_at)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card-tech p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <div className="overline">AI risk analysis</div>
            </div>
            {selected && (
              <button
                onClick={analyze}
                disabled={loading}
                data-testid="analyze-deployment"
                className="text-[11px] px-2.5 py-1 border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 rounded-sm hover:bg-cyan-500/20 flex items-center gap-1 font-mono disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {loading ? "Analyzing…" : ai ? "Regenerate" : "Analyze"}
              </button>
            )}
          </div>
          {selected ? (
            <>
              <div className="border-l-2 border-cyan-500/40 pl-3 py-1">
                <div className="text-xs font-medium">{selected.service} → {selected.version}</div>
                <div className="text-[11px] text-zinc-500 font-mono mt-1">{selected.commit_message}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div>
                  <div className="overline text-[9px]">Risk</div>
                  <div className={`mt-1 ${riskColor[selected.risk_level]} inline-block px-1.5 rounded-sm border uppercase text-[10px] tracking-wider`}>
                    {selected.risk_level} · {selected.risk_score}
                  </div>
                </div>
                <div>
                  <div className="overline text-[9px]">Blast</div>
                  <div className="mt-1 text-zinc-300">{selected.files_changed} files</div>
                </div>
                <div>
                  <div className="overline text-[9px]">Deltas</div>
                  <div className="mt-1 text-zinc-300">+{selected.lines_added}/-{selected.lines_removed}</div>
                </div>
              </div>
              <div className="min-h-[180px] text-sm whitespace-pre-wrap text-zinc-300 leading-relaxed" data-testid="deployment-ai-content">
                {ai || (
                  <span className="text-zinc-500 text-xs font-mono">
                    Click "Analyze" to have Sentinel AI evaluate this deployment: rationale, blast radius, watch-list, rollback strategy.
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-500 font-mono">Select a deployment to analyze.</div>
          )}
        </div>
      </div>
    </div>
  );
}
