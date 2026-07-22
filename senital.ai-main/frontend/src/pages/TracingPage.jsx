import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { GitBranch } from "lucide-react";
import { relTime } from "@/lib/utils";

const SVC_COLORS = ["#10b981", "#06b6d4", "#f59e0b", "#ef4444", "#a78bfa", "#f472b6", "#84cc16", "#fbbf24"];

export default function TracingPage() {
  const [traces, setTraces] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    authApi.get("/traces").then((r) => {
      setTraces(r.data);
      if (r.data[0]) load(r.data[0].id);
    });
  }, []);

  const load = async (id) => {
    const { data } = await authApi.get(`/traces/${id}`);
    setSelected(data);
  };

  const colorMap = (spans) => {
    const m = new Map();
    let i = 0;
    for (const s of spans) if (!m.has(s.service)) m.set(s.service, SVC_COLORS[i++ % SVC_COLORS.length]);
    return m;
  };

  return (
    <div className="p-6 space-y-4" data-testid="tracing-page">
      <div>
        <div className="overline">Observability</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-cyan-400" />
          Distributed Tracing
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">OpenTelemetry · W3C Trace Context · Tempo backend</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-tech overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] overline">Recent traces</div>
          <div className="divide-y divide-[var(--border)] max-h-[540px] overflow-y-auto">
            {traces.map((t) => (
              <button
                key={t.id}
                onClick={() => load(t.id)}
                data-testid={`trace-item-${t.id}`}
                className={`w-full text-left p-3 row-hover ${selected?.id === t.id ? "bg-[var(--surface-2)]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-cyan-400">{t.id}</span>
                  <span className={`text-[10px] font-mono ${t.status === "error" ? "text-red-400" : "text-emerald-400"}`}>
                    {t.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs mt-1 font-mono text-zinc-200 truncate">{t.endpoint}</div>
                <div className="text-[10px] text-zinc-500 mt-1 font-mono flex justify-between">
                  <span>{t.root_service}</span>
                  <span>{t.duration_ms}ms · {relTime(t.started_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card-tech lg:col-span-2 overflow-hidden">
          {!selected ? (
            <div className="p-8 text-zinc-500 font-mono text-xs">Select a trace to inspect the waterfall.</div>
          ) : (
            <>
              <div className="p-4 border-b border-[var(--border)]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-mono text-cyan-400">{selected.id}</div>
                    <div className="text-xs mt-1">{selected.endpoint}</div>
                  </div>
                  <div className="text-right">
                    <div className="overline">Total duration</div>
                    <div className="font-mono text-xl">{selected.duration_ms}<span className="text-xs text-zinc-500">ms</span></div>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-1.5" data-testid="trace-waterfall">
                {(() => {
                  const cm = colorMap(selected.spans);
                  return selected.spans.map((sp) => {
                    const left = (sp.start_ms / selected.duration_ms) * 100;
                    const width = Math.max(0.8, (sp.duration_ms / selected.duration_ms) * 100);
                    const isBottleneck = sp.id === selected.bottleneck_span_id;
                    return (
                      <div key={sp.id} className="flex items-center gap-3 text-[11px]" data-testid={`span-${sp.id}`}>
                        <div className="w-52 flex-shrink-0 truncate font-mono" style={{ paddingLeft: sp.depth * 12 }}>
                          <span className="text-zinc-500">{"↳".repeat(Math.min(sp.depth, 3))} </span>
                          <span className="text-zinc-200">{sp.service}</span>
                          <span className="text-zinc-500"> · {sp.operation}</span>
                        </div>
                        <div className="flex-1 relative h-5 bg-[var(--surface-2)] rounded-sm overflow-hidden">
                          <div
                            className="absolute top-0 bottom-0 rounded-sm"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              background: cm.get(sp.service),
                              opacity: sp.status === "error" ? 0.9 : 0.75,
                              boxShadow: isBottleneck ? "0 0 0 1px #ef4444" : "none",
                            }}
                          />
                          {isBottleneck && (
                            <div className="absolute inset-0 border border-red-500/60 rounded-sm pointer-events-none" />
                          )}
                        </div>
                        <div className="w-16 text-right font-mono text-zinc-400">{sp.duration_ms}ms</div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="p-4 border-t border-[var(--border)]">
                <div className="overline mb-2">Services in trace</div>
                <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                  {[...colorMap(selected.spans).entries()].map(([svc, c]) => (
                    <div key={svc} className="flex items-center gap-1.5 border border-[var(--border)] rounded-sm px-2 py-0.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                      {svc}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
