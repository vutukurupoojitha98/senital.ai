import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { ListTree, GitCommit, Waves, Container, Database, Bell, Wrench, CheckCircle2, Rocket } from "lucide-react";
import { relTime, severityColor } from "@/lib/utils";

const iconFor = (t) => ({
  deployment: GitCommit,
  kafka: Waves,
  k8s_event: Container,
  db: Database,
  alert: Bell,
  notification: Bell,
  mitigation: Wrench,
  resolution: CheckCircle2,
  incident: Bell,
  release: Rocket,
}[t] || Bell);

export default function TimelinePage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    Promise.all([
      authApi.get("/incidents"),
      authApi.get("/deployments"),
      authApi.get("/kafka/topics"),
      authApi.get("/k8s/pods"),
    ]).then(([inc, dep, kaf, k8s]) => {
      const events = [];
      inc.data.slice(0, 8).forEach((i) =>
        events.push({
          id: `inc-${i.id}`,
          at: i.opened_at,
          type: "incident",
          title: i.title,
          detail: `[${i.severity}] service=${i.service} · ${i.impact}`,
          color: "red",
          severity: i.severity,
        }),
      );
      dep.data.slice(0, 8).forEach((d) =>
        events.push({
          id: `dep-${d.id}`,
          at: d.deployed_at,
          type: "deployment",
          title: `${d.service} ${d.version}`,
          detail: `${d.commit_sha} · ${d.commit_message} · risk=${d.risk_level}`,
          color: d.risk_level,
        }),
      );
      const crash = k8s.data.filter((p) => p.status === "CrashLoopBackOff").slice(0, 4);
      crash.forEach((p) =>
        events.push({
          id: `pod-${p.id}`,
          at: new Date().toISOString(),
          type: "k8s_event",
          title: "CrashLoopBackOff",
          detail: `pod=${p.name} restarts=${p.restarts}`,
          color: "high",
        }),
      );
      const laggy = kaf.data.filter((t) => t.lag > 3000).slice(0, 4);
      laggy.forEach((t) =>
        events.push({
          id: `kaf-${t.id}`,
          at: new Date(Date.now() - Math.random() * 1800000).toISOString(),
          type: "kafka",
          title: "Kafka lag alert",
          detail: `topic=${t.name} lag=${t.lag} dlq=${t.dlq_count}`,
          color: "medium",
        }),
      );
      events.sort((a, b) => new Date(b.at) - new Date(a.at));
      setItems(events);
    });
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="timeline-page">
      <div>
        <div className="overline">Chronological view</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <ListTree className="w-6 h-6 text-cyan-400" />
          Incident Timeline
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">
          Correlated stream · deployments · K8s events · Kafka signals · incidents
        </p>
      </div>

      <div className="card-tech p-6">
        <div className="relative pl-10" data-testid="timeline-list">
          <div className="absolute left-4 top-2 bottom-2 w-px bg-[var(--border)]" />
          {items.map((e) => {
            const Icon = iconFor(e.type);
            return (
              <div key={e.id} className="relative mb-5 last:mb-0">
                <div className="absolute -left-7 top-0 w-7 h-7 rounded-sm border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  {e.severity && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border ${severityColor[e.severity]}`}>{e.severity}</span>
                  )}
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{new Date(e.at).toISOString().replace("T", " ").slice(0, 19)} UTC · {relTime(e.at)}</div>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5 font-mono">{e.detail}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
