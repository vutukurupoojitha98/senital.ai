import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/Sparkline";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function KpiTile({ label, value, unit, delta, deltaGood = "down", sparkData, sparkKey = "v", sparkColor = "#06b6d4", testId, hint }) {
  const isPositive = delta > 0;
  const good = (deltaGood === "up" && isPositive) || (deltaGood === "down" && !isPositive);
  return (
    <div className="card-tech p-4 flex flex-col gap-3 min-h-[120px]" data-testid={testId}>
      <div className="flex items-start justify-between">
        <div className="overline">{label}</div>
        {delta !== undefined && delta !== null && (
          <div
            className={cn(
              "flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded-sm border",
              good ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" : "text-red-400 border-red-500/30 bg-red-500/5",
            )}
          >
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="stat-value text-2xl md:text-3xl tracking-tight">{value}</span>
        {unit && <span className="text-xs text-zinc-500 font-mono">{unit}</span>}
      </div>
      {sparkData && sparkData.length > 0 && (
        <Sparkline data={sparkData} dataKey={sparkKey} color={sparkColor} height={30} />
      )}
      {hint && <div className="text-[11px] text-zinc-500 font-mono">{hint}</div>}
    </div>
  );
}
