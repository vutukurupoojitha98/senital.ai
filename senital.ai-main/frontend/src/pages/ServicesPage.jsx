import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { StatusDot } from "@/components/StatusDot";
import { Sparkline } from "@/components/Sparkline";
import { formatNum, relTime } from "@/lib/utils";
import { Search } from "lucide-react";

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");

  useEffect(() => {
    const load = () => authApi.get("/services").then((r) => setServices(r.data));
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const filtered = services
    .filter((s) => (statusF === "all" ? true : s.status === statusF))
    .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-4" data-testid="services-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="overline">Registry</div>
          <h1 className="font-heading text-2xl tracking-tight mt-1">Microservices</h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono">{services.length} services across production · Java 17 / Spring Boot fleet</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter services"
              data-testid="services-search"
              className="pl-8 pr-3 py-1.5 bg-[var(--surface-1)] border border-[var(--border)] rounded-sm text-xs font-mono w-56 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div className="flex gap-1 text-[11px]">
            {["all", "healthy", "degraded", "down"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusF(s)}
                data-testid={`filter-${s}`}
                className={`px-2 py-1 border rounded-sm capitalize font-mono transition-colors ${statusF === s ? "border-emerald-500 text-emerald-400" : "border-[var(--border)] text-zinc-500 hover:text-zinc-200"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card-tech overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
              <th className="text-left px-4 py-2.5 font-heading">Service</th>
              <th className="text-left px-3 py-2.5 font-heading">Domain</th>
              <th className="text-left px-3 py-2.5 font-heading">Version</th>
              <th className="text-right px-3 py-2.5 font-heading">RPS</th>
              <th className="text-right px-3 py-2.5 font-heading">p50 / p95 / p99</th>
              <th className="text-right px-3 py-2.5 font-heading">Error %</th>
              <th className="text-right px-3 py-2.5 font-heading">CPU / Mem</th>
              <th className="text-right px-3 py-2.5 font-heading">Uptime</th>
              <th className="text-right px-3 py-2.5 font-heading">Last deploy</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)] row-hover" data-testid={`service-row-${s.name}`}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <StatusDot status={s.status} />
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{s.language} · {s.instances} pods</div>
                </td>
                <td className="px-3 py-2.5 text-zinc-400 font-mono">{s.domain}</td>
                <td className="px-3 py-2.5 font-mono text-zinc-300">{s.version}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatNum(s.rps, 0)}</td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <span className="text-zinc-400">{s.latency_p50}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-zinc-300">{s.latency_p95}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className={s.latency_p99 > 700 ? "text-amber-400" : "text-zinc-100"}>{s.latency_p99}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <span className={s.error_rate > 2 ? "text-red-400" : s.error_rate > 1 ? "text-amber-400" : "text-emerald-400"}>{s.error_rate}%</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{s.cpu}% / {s.memory}%</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{s.uptime_pct}%</td>
                <td className="px-3 py-2.5 text-right text-[11px] text-zinc-500 font-mono">{relTime(s.last_deploy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
