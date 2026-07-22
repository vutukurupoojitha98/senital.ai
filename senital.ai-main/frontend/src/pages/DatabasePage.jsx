import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { KpiTile } from "@/components/KpiTile";
import { StatusDot } from "@/components/StatusDot";
import { Database, Sparkles } from "lucide-react";
import { formatNum } from "@/lib/utils";

export default function DatabasePage() {
  const [instances, setInstances] = useState([]);
  const [slow, setSlow] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [a, b, c] = await Promise.all([
        authApi.get("/database/instances"),
        authApi.get("/database/slow-queries"),
        authApi.get("/database/summary"),
      ]);
      setInstances(a.data);
      setSlow(b.data);
      setSummary(c.data);
    };
    load();
    const int = setInterval(load, 8000);
    return () => clearInterval(int);
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="database-page">
      <div>
        <div className="overline">Data platform</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <Database className="w-6 h-6 text-cyan-400" />
          Database Intelligence
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">PostgreSQL 15 · Aurora replicas · pgBouncer · Redis 7 caching layer</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="Instances" value={summary.instances} testId="db-kpi-instances" />
          <KpiTile label="Avg pool usage" value={summary.avg_connection_pct} unit="%" testId="db-kpi-pool" />
          <KpiTile label="Slow queries" value={summary.slow_queries_count} testId="db-kpi-slow" />
          <KpiTile label="Cache hit ratio" value={summary.avg_cache_hit} unit="%" testId="db-kpi-cache" />
          <KpiTile label="AI est. savings" value={summary.estimated_savings_pct} unit="%" testId="db-kpi-savings" hint="if applied" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-tech overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] overline">Instances</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
                <th className="text-left px-4 py-2 font-heading">Name</th>
                <th className="text-left px-3 py-2 font-heading">Role</th>
                <th className="text-right px-3 py-2 font-heading">Conns</th>
                <th className="text-right px-3 py-2 font-heading">CPU</th>
                <th className="text-right px-3 py-2 font-heading">Cache</th>
                <th className="text-right px-3 py-2 font-heading">Lag</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((db) => (
                <tr key={db.id} className="border-b border-[var(--border)] row-hover" data-testid={`db-row-${db.name}`}>
                  <td className="px-4 py-2 font-mono">
                    <div className="flex items-center gap-2">
                      <StatusDot status={db.status} size={6} />
                      {db.name}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{db.region}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-400 uppercase text-[10px] tracking-wider">{db.role}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={db.connections_active / db.connections_max > 0.9 ? "text-red-400" : "text-zinc-300"}>
                      {db.connections_active}
                    </span>
                    <span className="text-zinc-600">/{db.connections_max}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-300">{db.cpu}%</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">{db.cache_hit_ratio}%</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{db.replication_lag_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card-tech overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] overline flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> AI index recommendations
          </div>
          <div className="divide-y divide-[var(--border)] max-h-[400px] overflow-y-auto">
            {slow.slice(0, 4).map((q) => (
              <div key={q.id} className="p-3 space-y-2" data-testid={`slow-query-${q.id}`}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{q.table} · {formatNum(q.calls_per_min, 0)}/min</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-red-400">{q.avg_ms}ms avg</span>
                    <span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/30 rounded-sm px-1">-{q.estimated_gain_pct}%</span>
                  </div>
                </div>
                <div className="text-[11px] font-mono bg-[var(--surface-2)] rounded-sm p-2 text-zinc-300 overflow-x-auto whitespace-nowrap">
                  {q.query}
                </div>
                <div className="text-xs text-cyan-300 leading-relaxed">{q.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card-tech overflow-hidden" data-testid="all-slow-queries">
        <div className="p-4 border-b border-[var(--border)] overline">Slow query log</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
              <th className="text-left px-4 py-2 font-heading">Query</th>
              <th className="text-right px-3 py-2 font-heading">Avg</th>
              <th className="text-right px-3 py-2 font-heading">Calls/min</th>
              <th className="text-right px-3 py-2 font-heading">Total time</th>
              <th className="text-right px-3 py-2 font-heading">Gain</th>
            </tr>
          </thead>
          <tbody>
            {slow.map((q) => (
              <tr key={q.id} className="border-b border-[var(--border)] row-hover">
                <td className="px-4 py-2 font-mono text-zinc-300 truncate max-w-[560px]">{q.query}</td>
                <td className="px-3 py-2 text-right font-mono text-red-400">{q.avg_ms}ms</td>
                <td className="px-3 py-2 text-right font-mono">{formatNum(q.calls_per_min, 0)}</td>
                <td className="px-3 py-2 text-right font-mono text-amber-400">{q.total_time_pct}%</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-400">-{q.estimated_gain_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
