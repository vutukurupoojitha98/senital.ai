import { cn, statusDot } from "@/lib/utils";

export function StatusDot({ status, size = 8, className }) {
  return (
    <span
      className={cn("relative inline-block rounded-full pulse-dot", statusDot[status] || "bg-zinc-500", className)}
      style={{ width: size, height: size, color: "currentColor" }}
      data-testid={`status-dot-${status}`}
    />
  );
}
