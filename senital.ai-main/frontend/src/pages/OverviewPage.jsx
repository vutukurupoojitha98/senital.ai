import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { useLiveOverview } from "@/lib/useLiveOverview";
import { KpiTile } from "@/components/KpiTile";
import { StatusDot } from "@/components/StatusDot";
import { Sparkline } from "@/components/Sparkline";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { AlertOctagon, Activity, Cpu, Database, Rocket, Waves, Sparkles, Wifi, WifiOff } from "lucide-react";
import { relTime, severityColor, formatNum } from "@/lib/utils";
import { Link } from "react-router-dom";

const chartTip = {
  contentStyle: { background: "#16161a", border: "1px solid #2a2a30", borderRadius: 4, fontSize: 11, fontFamily: "IBM Plex Mono" },
  labelStyle: { color: "#a1a1aa" },
  itemStyle: { color: "#f5f5f7" },
};

export default function OverviewPage() {
  const [overview, setOverview] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [services, setServices] = useState([]);
  const live = useLiveOverview();

  const load = async () => {
    const [ov, inc, sv] = await Promise.all([
      authApi.get("/dashboard/overview"),
      authApi.get("/incidents"),
      authApi.get("/services"),
    ]);
    setOverview(ov.data);
    setIncidents(inc.data);
    setServices(sv.data);
  };

  useEffect(() => {
    load();
    // low-frequency backup poll for services + incidents (WS handles KPIs)
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (!overview) return <div className="p-8 text-zinc-500 text-sm font-mono">Loading platform telemetry…</div>;

  // Prefer live WS snapshot for KPIs; fall back to REST-loaded overview
  const kpi = live.snapshot || overview;
  const ts = live.timeseries || overview.timeseries;
  const active = incidents.filter((i) => i.status !== "resolved").slice(0, 5);

  return (
    <div className="p-6 space-y-6" data-testid="overview-page">
      {/* header row */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Global overview</div>
          <h1 className="font-heading text-2xl tracking-tight mt-1">Production Intelligence · Live</h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            {services.length} services · {kpi.services.healthy}/{kpi.services.total} healthy · autoscaler engaged
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            data-testid="live-indicator"
            className={`border rounded-sm px-2.5 py-1.5 flex items-center gap-2 text-[11px] font-mono ${
              live.connected
                ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                : "border-zinc-700 text-zinc-500"
            }`}
          >
            {live.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {live.connected ? "LIVE · WS" : "polling"}
          </div>
          <div className="border border-[var(--border)] rounded-sm px-3 py-1.5 flex items-center gap-2">
            <div className="overline">Health</div>
            <span className="font-mono text-lg text-emerald-400">{kpi.health_score}%</span>
          </div>
          <div className="border border-cyan-500/40 bg-cyan-500/5 rounded-sm px-3 py-1.5 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <div className="overline text-cyan-400">AI confidence</div>
            <span className="font-mono text-lg text-cyan-300">{(kpi.ai_confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          label="Requests / sec"
          value={formatNum(kpi.throughput_rps, 1)}
          unit="rps"
          delta={4.2}
          deltaGood="up"
          sparkData={ts.throughput}
          sparkColor="#10b981"
          testId="kpi-throughput"
        />
        <KpiTile
          label="Latency p99"
          value={formatNum(kpi.latency_p99_ms, 0)}
          unit="ms"
          delta={-3.1}
          sparkData={ts.latency}
          sparkKey="p99"
          sparkColor="#06b6d4"
          testId="kpi-latency"
        />
        <KpiTile
          label="Error rate"
          value={kpi.error_rate_pct.toFixed(2)}
          unit="%"
          delta={1.7}
          sparkData={ts.error_rate}
          sparkColor="#f59e0b"
          testId="kpi-errors"
        />
        <KpiTile
          label="Active incidents"
          value={kpi.active_incidents}
          delta={-12.4}
          hint={`${incidents.filter((i) => i.severity === "P1").length} P1 · ${incidents.filter((i) => i.severity === "P2").length} P2`}
          testId="kpi-incidents"
        />
        <KpiTile
          label="Kafka lag"
          value={formatNum(kpi.kafka_lag_total, 1)}
          unit="msgs"
          delta={8.9}
          hint="cross-topic aggregate"
          testId="kpi-kafka"
        />
        <KpiTile
          label="MTTR"
          value={kpi.mttr_minutes}
          unit="min"
          delta={-18.6}
          hint="rolling 7d"
          testId="kpi-mttr"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-tech p-4 lg:col-span-2" data-testid="chart-latency">
          <div className="flex items-center justify-between mb-3">
            <div className="overline">Latency percentiles · last 60m</div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full" />p50</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-cyan-400 rounded-full" />p95</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full" />p99</span>
            </div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={ts.latency}>
                <CartesianGrid stroke="#26262c" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="t" tickFormatter={(v) => v.slice(11, 16)} stroke="#6b6b74" fontSize={10} />
                <YAxis stroke="#6b6b74" fontSize={10} tickFormatter={(v) => `${v}ms`} />
                <Tooltip {...chartTip} labelFormatter={(v) => v.replace("T", " ").slice(0, 19)} />
                <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="p95" stroke="#06b6d4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="p99" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-tech p-4" data-testid="chart-throughput">
          <div className="overline mb-3">Throughput · rps</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={ts.throughput}>
                <defs>
                  <linearGradient id="tp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#26262c" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="t" tickFormatter={(v) => v.slice(11, 16)} stroke="#6b6b74" fontSize={10} />
                <YAxis stroke="#6b6b74" fontSize={10} />
                <Tooltip {...chartTip} />
                <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={1.5} fill="url(#tp)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Services + Incidents row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-tech lg:col-span-2" data-testid="services-grid">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="overline">Services · health matrix</div>
            <Link to="/services" className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px" style={{ background: "var(--border)" }}>
            {services.slice(0, 9).map((s) => (
              <Link
                to={`/services`}
                key={s.id}
                data-testid={`service-card-${s.name}`}
                className="p-3 flex flex-col gap-2 row-hover"
                style={{ background: "var(--surface-1)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={s.status} />
                    <span className="text-xs font-medium truncate">{s.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">{s.version}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                  <div>
                    <div className="text-zinc-500">RPS</div>
                    <div className="text-zinc-200">{formatNum(s.rps, 0)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">p99</div>
                    <div className="text-zinc-200">{s.latency_p99}ms</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">err</div>
                    <div className={s.error_rate > 2 ? "text-red-400" : "text-zinc-200"}>{s.error_rate}%</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card-tech" data-testid="active-incidents">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
              <div className="overline">Active incidents</div>
            </div>
            <Link to="/incidents" className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono">
              All →
            </Link>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {active.length === 0 && <div className="p-6 text-xs text-zinc-500 font-mono">No active incidents.</div>}
            {active.map((i) => (
              <Link
                to={`/incidents/${i.id}`}
                key={i.id}
                data-testid={`incident-item-${i.id}`}
                className="block p-3 row-hover"
              >
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border ${severityColor[i.severity]}`}>{i.severity}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium leading-snug">{i.title}</div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center gap-2">
                      <StatusDot status={i.status} size={6} />
                      {i.service} · {relTime(i.opened_at)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom quick links row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: "/kafka", label: "Kafka health", icon: Waves, hint: "topics · lag · DLQ" },
          { to: "/kubernetes", label: "Kubernetes", icon: Cpu, hint: "pods · HPA · restarts" },
          { to: "/database", label: "Database", icon: Database, hint: "slow queries · pool" },
          { to: "/deployments", label: "Deployments", icon: Rocket, hint: "risk analyzer" },
        ].map((q) => (
          <Link
            to={q.to}
            key={q.to}
            data-testid={`quick-${q.to.replace("/", "")}`}
            className="card-tech p-4 flex items-center gap-3 hover:border-cyan-500/40 transition-colors"
          >
            <q.icon className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-sm font-medium">{q.label}</div>
              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">{q.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
