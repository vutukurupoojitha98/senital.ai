import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { Bell, Mail, Slack, MessageSquare, Plus, Trash2, Send, Settings, CheckCircle2, AlertTriangle, Zap } from "lucide-react";
import { relTime, severityColor } from "@/lib/utils";
import { toast } from "sonner";

const chanIcon = { email: Mail, slack: Slack, teams: MessageSquare, pagerduty: Bell };

const METRICS = [
  { key: "latency_p99_ms", label: "Latency p99 (ms)" },
  { key: "error_rate_pct", label: "Error rate (%)" },
  { key: "kafka_lag", label: "Kafka lag" },
  { key: "cpu_pct", label: "CPU (%)" },
  { key: "db_connections_pct", label: "DB pool (%)" },
];

export default function NotificationsPage() {
  const [rules, setRules] = useState([]);
  const [channels, setChannels] = useState([]);
  const [history, setHistory] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [form, setForm] = useState({
    name: "", metric: METRICS[0].key, op: ">", threshold: 100, window_min: 5, severity: "P2", enabled: true,
  });

  const load = async () => {
    const [r, c, h] = await Promise.all([
      authApi.get("/notifications/alert-rules"),
      authApi.get("/notifications/channels"),
      authApi.get("/notifications/history"),
    ]);
    setRules(r.data);
    setChannels(c.data);
    setHistory(h.data);
  };

  useEffect(() => {
    load();
    const t = setInterval(() => authApi.get("/notifications/history").then((r) => setHistory(r.data)), 15000);
    return () => clearInterval(t);
  }, []);

  const addRule = async (e) => {
    e.preventDefault();
    try {
      await authApi.post("/notifications/alert-rules", form);
      toast.success("Alert rule created");
      setShowAdd(false);
      setForm({ name: "", metric: METRICS[0].key, op: ">", threshold: 100, window_min: 5, severity: "P2", enabled: true });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const del = async (id) => {
    await authApi.delete(`/notifications/alert-rules/${id}`);
    toast.success("Rule deleted");
    load();
  };

  const triggerRule = async (id, name) => {
    try {
      const { data } = await authApi.post(`/notifications/alert-rules/${id}/trigger`);
      const delivered = data.results.filter((r) => r.delivered).length;
      const mocked = data.results.filter((r) => r.mocked).length;
      toast.success(`${name}: fired ${data.results.length} channel(s) · ${delivered} delivered · ${mocked} mocked`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const testChannel = async (ch) => {
    try {
      const { data } = await authApi.post(`/notifications/channels/${ch.id}/test`, {});
      if (data.delivered) toast.success(`${ch.type} delivered · ${data.detail}`);
      else if (data.mocked) toast.warning(`${ch.type} MOCKED · ${data.detail}`);
      else toast.error(`${ch.type} failed · ${data.detail}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const saveChannelConfig = async (ch, patch) => {
    await authApi.patch(`/notifications/channels/${ch.id}`, patch);
    toast.success(`${ch.type} channel updated`);
    setEditingChannel(null);
    load();
  };

  return (
    <div className="p-6 space-y-4" data-testid="notifications-page">
      <div>
        <div className="overline">Alerting</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <Bell className="w-6 h-6 text-cyan-400" />
          Alerts &amp; Notifications
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">Multi-channel routing · Email (SendGrid) · Slack · Microsoft Teams · PagerDuty · rules persisted in MongoDB</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alert rules */}
        <div className="card-tech lg:col-span-2 overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="overline">Alert rules · {rules.length}</div>
            <button
              onClick={() => setShowAdd((v) => !v)}
              data-testid="new-rule"
              className="text-[11px] px-2.5 py-1 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 rounded-sm flex items-center gap-1 font-mono hover:bg-emerald-500/20 transition-colors"
            >
              <Plus className="w-3 h-3" /> New rule
            </button>
          </div>
          {showAdd && (
            <form onSubmit={addRule} className="p-4 border-b border-[var(--border)] grid grid-cols-2 md:grid-cols-4 gap-2 text-xs" data-testid="new-rule-form">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="col-span-2 md:col-span-2 px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono" />
              <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono">
                {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <select value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })} className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono">
                <option>&gt;</option><option>&lt;</option><option>=</option>
              </select>
              <input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: parseFloat(e.target.value) })} placeholder="Threshold" className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono" />
              <input type="number" value={form.window_min} onChange={(e) => setForm({ ...form, window_min: parseInt(e.target.value) })} placeholder="Window min" className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono" />
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="px-2 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm font-mono">
                <option>P1</option><option>P2</option><option>P3</option>
              </select>
              <button type="submit" data-testid="save-rule" className="col-span-2 md:col-span-1 px-3 py-1.5 bg-emerald-500 text-black rounded-sm font-mono">Save</button>
            </form>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
                <th className="text-left px-4 py-2 font-heading">Name</th>
                <th className="text-left px-3 py-2 font-heading">Condition</th>
                <th className="text-right px-3 py-2 font-heading">Window</th>
                <th className="text-right px-3 py-2 font-heading">Severity</th>
                <th className="text-right px-3 py-2 font-heading">Enabled</th>
                <th className="text-right px-3 py-2 font-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] row-hover" data-testid={`rule-${r.id}`}>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{r.metric} {r.op} {r.threshold}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.window_min}m</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm border ${severityColor[r.severity]}`}>{r.severity}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.enabled ? <span className="text-emerald-400">on</span> : <span className="text-zinc-500">off</span>}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <button
                      onClick={() => triggerRule(r.id, r.name)}
                      title="Fire this rule now through all enabled channels"
                      data-testid={`fire-${r.id}`}
                      className="text-zinc-500 hover:text-cyan-400 p-1 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(r.id)} className="text-zinc-500 hover:text-red-400 p-1 transition-colors" data-testid={`del-${r.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Channels */}
        <div className="card-tech overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] overline">Delivery channels</div>
          <div className="divide-y divide-[var(--border)]">
            {channels.map((c) => {
              const Icon = chanIcon[c.type] || Bell;
              return (
                <div key={c.id} className="p-3" data-testid={`channel-${c.type}`}>
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-cyan-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium capitalize flex items-center gap-2">
                        {c.type}
                        {c.configured ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" title="Configured" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-400" title="MOCKED — not configured" />
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">{c.target}</div>
                    </div>
                    <button
                      onClick={() => setEditingChannel(editingChannel?.id === c.id ? null : c)}
                      data-testid={`config-${c.type}`}
                      className="text-zinc-500 hover:text-cyan-300 p-1 transition-colors"
                      title="Configure"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => testChannel(c)}
                      data-testid={`test-${c.type}`}
                      className="text-zinc-500 hover:text-emerald-300 p-1 transition-colors"
                      title="Send test"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {editingChannel?.id === c.id && (
                    <ChannelConfigForm channel={c} onSave={(patch) => saveChannelConfig(c, patch)} onCancel={() => setEditingChannel(null)} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-3 border-t border-[var(--border)] text-[10px] text-zinc-500 font-mono">
            Configure webhook / API key to switch a channel from MOCKED to LIVE delivery.
          </div>
        </div>
      </div>

      {/* History */}
      <div className="card-tech overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] overline">Notification history</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
              <th className="text-left px-4 py-2 font-heading">Channel</th>
              <th className="text-left px-3 py-2 font-heading">Target</th>
              <th className="text-left px-3 py-2 font-heading">Subject</th>
              <th className="text-left px-3 py-2 font-heading">Status</th>
              <th className="text-right px-3 py-2 font-heading">Sent</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const Icon = chanIcon[h.channel] || Bell;
              return (
                <tr key={h.id} className="border-b border-[var(--border)] row-hover">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 capitalize font-mono">
                      <Icon className="w-3.5 h-3.5 text-cyan-400" /> {h.channel}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{h.target}</td>
                  <td className="px-3 py-2 text-zinc-200">{h.subject}</td>
                  <td className="px-3 py-2 text-[10px] font-mono">
                    {h.delivered
                      ? <span className="text-emerald-400 border border-emerald-500/30 rounded-sm px-1.5 py-0.5">DELIVERED</span>
                      : h.mocked
                      ? <span className="text-amber-400 border border-amber-500/30 rounded-sm px-1.5 py-0.5">MOCKED</span>
                      : <span className="text-red-400 border border-red-500/30 rounded-sm px-1.5 py-0.5">FAILED</span>}
                    {h.detail && <span className="ml-2 text-zinc-500">{h.detail}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-500">{relTime(h.sent_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelConfigForm({ channel, onSave, onCancel }) {
  const [state, setState] = useState({ target: channel.target, webhook_url: "", api_key: "", from_email: "" });
  const submit = (e) => {
    e.preventDefault();
    const config = {};
    if (state.webhook_url) config.webhook_url = state.webhook_url;
    if (state.api_key) config.api_key = state.api_key;
    if (state.from_email) config.from_email = state.from_email;
    onSave({ target: state.target, config });
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 pt-2 border-t border-[var(--border)]" data-testid={`config-form-${channel.type}`}>
      <div>
        <div className="overline text-[9px] mb-1">{channel.type === "email" ? "Recipient email" : "Target label"}</div>
        <input
          value={state.target}
          onChange={(e) => setState({ ...state, target: e.target.value })}
          className="w-full px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm text-[11px] font-mono"
        />
      </div>
      {(channel.type === "slack" || channel.type === "teams") && (
        <div>
          <div className="overline text-[9px] mb-1">Incoming webhook URL</div>
          <input
            placeholder={channel.type === "slack" ? "https://hooks.slack.com/services/..." : "https://outlook.office.com/webhook/..."}
            value={state.webhook_url}
            onChange={(e) => setState({ ...state, webhook_url: e.target.value })}
            data-testid={`input-webhook-${channel.type}`}
            className="w-full px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm text-[11px] font-mono"
          />
          {channel.configured && <div className="text-[10px] text-zinc-500 mt-1 font-mono">current: {channel.config?.webhook_url}</div>}
        </div>
      )}
      {channel.type === "email" && (
        <>
          <div>
            <div className="overline text-[9px] mb-1">SendGrid API key</div>
            <input
              type="password"
              placeholder="SG.xxxxxxxx"
              value={state.api_key}
              onChange={(e) => setState({ ...state, api_key: e.target.value })}
              data-testid="input-sendgrid-key"
              className="w-full px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm text-[11px] font-mono"
            />
          </div>
          <div>
            <div className="overline text-[9px] mb-1">Verified sender email</div>
            <input
              placeholder="alerts@yourdomain.com"
              value={state.from_email}
              onChange={(e) => setState({ ...state, from_email: e.target.value })}
              className="w-full px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm text-[11px] font-mono"
            />
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button type="submit" data-testid={`save-config-${channel.type}`} className="text-[11px] px-2.5 py-1 bg-emerald-500 text-black rounded-sm font-mono">Save</button>
        <button type="button" onClick={onCancel} className="text-[11px] px-2.5 py-1 border border-[var(--border)] text-zinc-400 rounded-sm font-mono">Cancel</button>
      </div>
    </form>
  );
}
