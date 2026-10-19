"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, Legend, SERIES, axisProps, brlShort, gridProps } from "@/components/charts/chart-kit";
import { formatBRL } from "@/domain/money";

/** Faturamento por tipo (vendas × serviços), barras empilhadas por dia. */
export function TypeChart({ data }: { data: { label: string; revenue: number; services: number }[] }) {
  const totals = data.reduce((a, d) => ({ sales: a.sales + d.revenue, services: a.services + d.services }), { sales: 0, services: 0 });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend
          items={[
            { label: `Vendas · ${formatBRL(totals.sales)}`, color: SERIES[0] },
            { label: `Serviços · ${formatBRL(totals.services)}`, color: SERIES[1] },
          ]}
        />
      </div>
      <div className="h-64" role="img" aria-label="Faturamento por dia, separado em vendas e serviços">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
            <YAxis {...axisProps} tickFormatter={brlShort} width={52} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip />} />
            <Bar dataKey="revenue" name="Vendas" stackId="t" fill={SERIES[0]} maxBarSize={22} stroke="var(--card)" strokeWidth={1} />
            <Bar dataKey="services" name="Serviços" stackId="t" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} stroke="var(--card)" strokeWidth={1} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
