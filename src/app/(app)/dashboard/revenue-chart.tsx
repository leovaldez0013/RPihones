"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, SERIES, axisProps, brlShort, gridProps } from "@/components/charts/chart-kit";

export function RevenueChart({ data }: { data: { label: string; revenue: number; count: number }[] }) {
  return (
    <div className="h-64" role="img" aria-label="Faturamento diário dos últimos 30 dias">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...axisProps} tickFormatter={brlShort} width={52} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                label={label}
                payload={payload?.map((p) => ({ ...p, name: `Faturamento (${(p.payload as { count: number }).count} venda${(p.payload as { count: number }).count === 1 ? "" : "s"})` })) as never}
              />
            )}
          />
          <Bar dataKey="revenue" name="Faturamento" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
