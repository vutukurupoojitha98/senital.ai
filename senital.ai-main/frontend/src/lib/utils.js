import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatNum = (n, digits = 0) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(digits) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(digits) + "K";
  return Number(n).toFixed(digits);
};

export const formatMs = (ms) => `${Math.round(ms)}ms`;

export const relTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const severityColor = {
  P1: "text-red-400 border-red-500/40 bg-red-500/10",
  P2: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  P3: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
  low: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  medium: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  high: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
};

export const statusDot = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-400",
  down: "bg-red-500",
  Running: "bg-emerald-500",
  CrashLoopBackOff: "bg-red-500",
  Pending: "bg-amber-400",
  succeeded: "bg-emerald-500",
  rolled_back: "bg-red-500",
  open: "bg-red-500",
  investigating: "bg-amber-400",
  mitigated: "bg-cyan-400",
  resolved: "bg-emerald-500",
};
