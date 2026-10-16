"use client";

// Peças comuns dos gráficos (Recharts): paleta categórica validada (--series-N em globals.css),
// tooltip com texto em tinta neutra e formatação em R$.
import { formatBRL } from "@/domain/money";

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: "var(--chart-grid)", vertical: false } as const;

/** R$ compacto para eixos: 12,5 mil · 1,2 mi */
export function brlShort(cents: number) {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

type TooltipPayload = { name?: string; value?: number; color?: string; dataKey?: string | number };

export function ChartTooltip({
  active,
  payload,
  label,
  money = true,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  money?: boolean;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl border bg-popover px-3 py-2 text-xs shadow-lg">
      {label != null && <p className="mb-1 font-medium text-foreground">{labelFormatter ? labelFormatter(label) : label}</p>}
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium text-foreground tabular">{money ? formatBRL(p.value ?? 0) : (p.value ?? 0).toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={i.dashed ? "h-0 w-3 border-t-2 border-dashed" : "size-2.5 rounded-sm"} style={i.dashed ? { borderColor: i.color } : { background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
