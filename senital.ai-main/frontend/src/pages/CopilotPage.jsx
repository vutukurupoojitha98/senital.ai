import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authApi, API, getToken } from "@/lib/api";
import { Sparkles, Send, Loader2 } from "lucide-react";

const SUGGESTIONS = [
  "Why is checkout failing?",
  "Which deployment caused the latest outage?",
  "Which service is unhealthy right now?",
  "Explain the top Kafka lag and how to mitigate it.",
  "Summarize incidents in the last 24h and prioritize.",
  "Recommend an immediate fix for the DB connection pool warning.",
];

export default function CopilotPage() {
  const [sessionId] = useState(() => "cp-" + Math.random().toString(36).slice(2, 10));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [assistantBuf, setAssistantBuf] = useState("");
  const scrollRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoQuery = searchParams.get("q");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, assistantBuf]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoQuery && !autoFiredRef.current && !streaming) {
      autoFiredRef.current = true;
      send(autoQuery);
      // clear the ?q= from the URL so a refresh doesn't re-fire
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoQuery]);

  const send = async (text) => {
    if (!text.trim() || streaming) return;
    const userMsg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setStreaming(true);
    setAssistantBuf("");

    try {
      const resp = await fetch(`${API}/copilot/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      if (!resp.ok || !resp.body) throw new Error("stream failed: " + resp.status);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const ev of events) {
          if (!ev.startsWith("data:")) continue;
          const chunk = ev.replace(/^data:\s?/, "");
          if (chunk === "[DONE]") continue;
          acc += chunk;
          setAssistantBuf(acc);
        }
      }
      setMessages((m) => [...m, { id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: "assistant", content: acc }]);
      setAssistantBuf("");
    } catch (e) {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="p-6 space-y-4 h-full" data-testid="copilot-page">
      <div>
        <div className="overline">AI copilot</div>
        <h1 className="font-heading text-2xl tracking-tight mt-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-cyan-400" />
          Sentinel AI Copilot
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono">
          Grounded in live telemetry · Claude Sonnet 4.5 · session: {sessionId}
        </p>
      </div>

      <div className="card-tech flex flex-col" style={{ height: "calc(100vh - 240px)" }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="space-y-4" data-testid="copilot-suggestions">
              <div className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Ask about incidents, deployments, Kafka lag, Kubernetes pods, database performance,
                or request a fix. I have access to live telemetry across all microservices.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-3xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    data-testid={`suggestion-${s.slice(0, 10)}`}
                    className="text-left text-xs p-3 border border-[var(--border)] rounded-sm hover:border-cyan-500/40 hover:bg-cyan-500/5 text-zinc-300 transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-cyan-400 inline mr-1.5 -mt-0.5" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => <Msg key={m.id} role={m.role} content={m.content} />)}
          {streaming && <Msg role="assistant" content={assistantBuf} streaming />}
        </div>
        <div className="p-4 border-t border-[var(--border)]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2"
            data-testid="copilot-form"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sentinel AI about incidents, deployments, services, Kafka, K8s, DB…"
              data-testid="copilot-input"
              className="flex-1 px-3 py-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-sm text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              disabled={streaming}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              data-testid="copilot-send"
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-sm text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-opacity"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Msg({ role, content, streaming }) {
  const isUser = role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-sm flex-shrink-0 flex items-center justify-center border border-cyan-500/40 bg-cyan-500/10">
          <Sparkles className="w-4 h-4 text-cyan-400" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-sm p-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-emerald-500/10 border border-emerald-500/30 text-zinc-100"
            : "bg-[var(--surface-2)] border border-[var(--border)] text-zinc-200"
        }`}
      >
        {content}
        {streaming && <span className="caret" />}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-emerald-500 to-cyan-500 text-black text-[11px] font-mono font-bold flex items-center justify-center flex-shrink-0">
          ME
        </div>
      )}
    </div>
  );
}
