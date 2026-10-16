import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Card de indicador com variação opcional em relação ao período anterior. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  delta?: number | null;
  tone?: "default" | "green" | "red" | "amber" | "blue";
  className?: string;
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    green: "bg-emerald-500/10 text-emerald-600",
    red: "bg-red-500/10 text-red-600",
    amber: "bg-amber-500/10 text-amber-600",
    blue: "bg-sky-500/10 text-sky-600",
  }[tone];
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-soft", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex size-8 items-center justify-center rounded-xl", toneClass)}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular">{value}</div>
      {(hint || delta != null) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta != null && Number.isFinite(delta) && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", delta >= 0 ? "text-emerald-600" : "text-red-600")}>
              {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta).toFixed(1).replace(".", ",")}%
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}
