import { useEffect, useRef, useState } from "react";
import { API, getToken } from "@/lib/api";

/**
 * Subscribe to /api/ws/live for real-time overview snapshots.
 * Returns { snapshot, timeseries, connected }.
 * Falls back to null values on disconnect; caller should render stale data.
 */
export function useLiveOverview() {
  const [snapshot, setSnapshot] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let stopped = false;

    const connect = () => {
      const token = getToken();
      if (!token) return;
      // Derive ws URL from the API URL (works for http→ws and https→wss)
      const wsBase = API.replace(/^http/, "ws");
      const url = `${wsBase}/ws/live?token=${encodeURIComponent(token)}`;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => setConnected(true);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.kind === "init") {
              setSnapshot(msg.snapshot);
              setTimeseries(msg.timeseries);
            } else if (msg.kind === "tick") {
              setSnapshot(msg.snapshot);
              setTimeseries((prev) => {
                if (!prev || !msg.snapshot.latest) return prev;
                const latest = msg.snapshot.latest;
                const nxt = { ...prev };
                for (const k of ["latency", "error_rate", "throughput", "cpu", "memory"]) {
                  if (!latest[k]) continue;
                  const arr = [...(prev[k] || []), latest[k]];
                  nxt[k] = arr.slice(-60);
                }
                return nxt;
              });
            }
          } catch (err) {
            console.warn("[useLiveOverview] failed to parse WS message", err);
          }
        };
        ws.onclose = () => {
          setConnected(false);
          if (!stopped) retryRef.current = setTimeout(connect, 3000);
        };
        ws.onerror = (err) => {
          console.warn("[useLiveOverview] WS error", err);
          try { ws.close(); } catch { /* socket may already be closed; safe to ignore */ }
        };
      } catch (err) {
        console.warn("[useLiveOverview] WS connect failed, retrying…", err);
        if (!stopped) retryRef.current = setTimeout(connect, 3000);
      }
    };

    connect();
    return () => {
      stopped = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      try { wsRef.current?.close(); } catch { /* socket may already be closed; safe to ignore */ }
    };
  }, []);

  return { snapshot, timeseries, connected };
}
