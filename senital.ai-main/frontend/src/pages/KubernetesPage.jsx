import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { KpiTile } from "@/components/KpiTile";
import { StatusDot } from "@/components/StatusDot";
import { Container, Cpu } from "lucide-react";

export default function KubernetesPage() {
  const [pods, setPods] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [p, s] = await Promise.all([authApi.get("/k8s/pods"), authApi.get("/k8s/summary")]);
      setPods(p.data);
      setSummary(s.data);
    };
    load();
    const int = setInterval(load, 5000);
    return () => clearInterval(int);
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="k8s-page">
      <div>
        <div className="overline">Container orchestration</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <Container className="w-6 h-6 text-cyan-400" />
          Kubernetes · AKS
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">
          Azure Kubernetes Service · 3 nodepools · HPA enabled · Karpenter-driven
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiTile label="Total pods" value={summary.total} testId="k8s-kpi-total" />
          <KpiTile label="Running" value={summary.running} testId="k8s-kpi-running" />
          <KpiTile label="CrashLoop" value={summary.crashloop} testId="k8s-kpi-crash" />
          <KpiTile label="Pending" value={summary.pending} testId="k8s-kpi-pending" />
          <KpiTile label="Avg CPU" value={summary.avg_cpu} unit="%" testId="k8s-kpi-cpu" />
          <KpiTile label="Avg memory" value={summary.avg_memory} unit="%" testId="k8s-kpi-mem" />
        </div>
      )}

      <div className="card-tech overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
              <th className="text-left px-4 py-2.5 font-heading">Pod</th>
              <th className="text-left px-3 py-2.5 font-heading">Namespace</th>
              <th className="text-left px-3 py-2.5 font-heading">Status</th>
              <th className="text-right px-3 py-2.5 font-heading">Restarts</th>
              <th className="text-right px-3 py-2.5 font-heading">CPU</th>
              <th className="text-right px-3 py-2.5 font-heading">Memory</th>
              <th className="text-left px-3 py-2.5 font-heading">Node</th>
              <th className="text-right px-3 py-2.5 font-heading">Age</th>
              <th className="text-right px-3 py-2.5 font-heading">HPA</th>
            </tr>
          </thead>
          <tbody>
            {pods.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] row-hover" data-testid={`k8s-pod-${p.name}`}>
                <td className="px-4 py-2.5 font-mono text-zinc-200">{p.name}</td>
                <td className="px-3 py-2.5 font-mono text-zinc-400">{p.namespace}</td>
                <td className="px-3 py-2.5">
                  <div className="inline-flex items-center gap-1.5 text-[11px]">
                    <StatusDot status={p.status} size={6} />
                    <span className={p.status === "CrashLoopBackOff" ? "text-red-400 font-mono" : "font-mono text-zinc-300"}>{p.status}</span>
                  </div>
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${p.restarts > 5 ? "text-red-400" : p.restarts > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                  {p.restarts}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${p.cpu_pct > 85 ? "text-red-400" : p.cpu_pct > 70 ? "text-amber-400" : "text-zinc-300"}`}>
                  {p.cpu_pct}%
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${p.memory_pct > 90 ? "text-red-400" : p.memory_pct > 75 ? "text-amber-400" : "text-zinc-300"}`}>
                  {p.memory_pct}%
                </td>
                <td className="px-3 py-2.5 font-mono text-zinc-500">{p.node}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-500">{p.age_hours}h</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">
                  {p.hpa.current}/{p.hpa.max}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
