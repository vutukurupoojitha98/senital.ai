import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { KpiTile } from "@/components/KpiTile";
import { formatNum } from "@/lib/utils";
import { Waves, Sparkles, AlertTriangle } from "lucide-react";

const predBadge = {
  stable: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  at_risk: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  degrading: "text-red-400 border-red-500/30 bg-red-500/10",
};

export default function KafkaPage() {
  const [topics, setTopics] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [t, s] = await Promise.all([authApi.get("/kafka/topics"), authApi.get("/kafka/summary")]);
      setTopics(t.data);
      setSummary(s.data);
    };
    load();
    const int = setInterval(load, 6000);
    return () => clearInterval(int);
  }, []);

  return (
    <div className="p-6 space-y-4" data-testid="kafka-page">
      <div>
        <div className="overline">Event streaming</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <Waves className="w-6 h-6 text-cyan-400" />
          Kafka Cluster
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">3 brokers · 3 replicas · MSK + Confluent Cloud multi-region</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="Topics" value={summary.topics_count} testId="kafka-kpi-topics" />
          <KpiTile label="Aggregate lag" value={formatNum(summary.total_lag, 1)} unit="msgs" testId="kafka-kpi-lag" />
          <KpiTile label="Throughput" value={formatNum(summary.throughput_msg_s, 1)} unit="msg/s" testId="kafka-kpi-throughput" />
          <KpiTile label="Dead-letter queue" value={summary.dlq_count} unit="events" testId="kafka-kpi-dlq" />
          <KpiTile label="At-risk topics" value={summary.at_risk_topics} hint="AI prediction" testId="kafka-kpi-risk" />
        </div>
      )}

      <div className="card-tech overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
              <th className="text-left px-4 py-2.5 font-heading">Topic</th>
              <th className="text-right px-3 py-2.5 font-heading">Partitions</th>
              <th className="text-right px-3 py-2.5 font-heading">Consumers</th>
              <th className="text-right px-3 py-2.5 font-heading">Lag</th>
              <th className="text-right px-3 py-2.5 font-heading">Throughput msg/s</th>
              <th className="text-right px-3 py-2.5 font-heading">DLQ</th>
              <th className="text-right px-3 py-2.5 font-heading">Retry</th>
              <th className="text-right px-3 py-2.5 font-heading">Failed</th>
              <th className="text-right px-3 py-2.5 font-heading">AI prediction</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.id} className="border-b border-[var(--border)] row-hover" data-testid={`kafka-row-${t.name}`}>
                <td className="px-4 py-2.5 font-mono">{t.name}</td>
                <td className="px-3 py-2.5 text-right font-mono">{t.partitions}</td>
                <td className="px-3 py-2.5 text-right font-mono">{t.consumer_groups}</td>
                <td className={`px-3 py-2.5 text-right font-mono ${t.lag > 5000 ? "text-red-400" : t.lag > 2000 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatNum(t.lag, 0)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{formatNum(t.throughput_msg_s, 1)}</td>
                <td className="px-3 py-2.5 text-right font-mono">
                  {t.dlq_count > 0 ? <span className="text-amber-400">{t.dlq_count}</span> : <span className="text-zinc-500">0</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{t.retry_count}</td>
                <td className="px-3 py-2.5 text-right font-mono">
                  {t.failed_events > 0 ? <span className="text-red-400">{t.failed_events}</span> : <span className="text-zinc-500">0</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border uppercase tracking-wider ${predBadge[t.ai_prediction]}`}>
                      {t.ai_prediction.replace("_", " ")}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400">{(t.ai_confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary?.at_risk_names?.length > 0 && (
        <div className="card-tech p-4 border-amber-500/30" data-testid="kafka-ai-warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <div className="text-sm font-medium">Sentinel AI predicts consumer backpressure</div>
              <div className="text-xs text-zinc-400 mt-1">
                Topics at risk of degrading within the next 15 minutes based on trailing throughput, lag velocity and DLQ growth:{" "}
                <span className="font-mono text-amber-300">{summary.at_risk_names.join(", ")}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
