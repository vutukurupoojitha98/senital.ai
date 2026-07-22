import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { StatusDot } from "@/components/StatusDot";
import { relTime, severityColor } from "@/lib/utils";
import { Link } from "react-router-dom";
import { AlertOctagon } from "lucide-react";

export default function IncidentsPage() {
  const [items, setItems] = useState([]);
  const [statusF, setStatusF] = useState("all");

  useEffect(() => {
    const load = () => authApi.get("/incidents").then((r) => setItems(r.data));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const filtered = statusF === "all" ? items : items.filter((i) => i.status === statusF);
  const bySev = (sev) => items.filter((i) => i.severity === sev).length;

  return (
    <div className="p-6 space-y-4" data-testid="incidents-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="overline">Incident register</div>
          <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-red-400" />
            Incidents
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            {bySev("P1")} P1 · {bySev("P2")} P2 · {bySev("P3")} P3 · AI-detected anomalies
          </p>
        </div>
        <div className="flex gap-1 text-[11px]">
          {["all", "open", "investigating", "mitigated", "resolved"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusF(s)}
              data-testid={`incident-filter-${s}`}
              className={`px-2 py-1 border rounded-sm capitalize font-mono transition-colors ${statusF === s ? "border-emerald-500 text-emerald-400" : "border-[var(--border)] text-zinc-500 hover:text-zinc-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="card-tech divide-y divide-[var(--border)]">
        {filtered.map((i) => (
          <Link
            to={`/incidents/${i.id}`}
            key={i.id}
            data-testid={`incident-row-${i.id}`}
            className="block p-4 row-hover"
          >
            <div className="flex items-start gap-4">
              <span className={`text-xs font-mono px-2 py-0.5 rounded-sm border ${severityColor[i.severity]}`}>{i.severity}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium">{i.title}</div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    <StatusDot status={i.status} size={6} />
                    {i.status}
                  </div>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono mt-1 flex items-center gap-3 flex-wrap">
                  <span>service: {i.service}</span>
                  <span>opened {relTime(i.opened_at)}</span>
                  <span>impact: {i.impact}</span>
                  {i.mttr_minutes && <span>MTTR {i.mttr_minutes}m</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="overline">AI conf</div>
                <div className="font-mono text-cyan-300 mt-1">{(i.ai_confidence * 100).toFixed(0)}%</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
