"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip, Legend, SERIES, axisProps, brlShort, gridProps } from "@/components/charts/chart-kit";
import { exportExcel } from "@/components/shared/export";
import { formatBRL } from "@/domain/money";
import type { Dre } from "@/domain/dre";
import { cn } from "@/lib/utils";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthLabel = (m: string, short = false) => {
  const [y, mm] = m.split("-");
  const name = MONTHS[Number(mm) - 1];
  return short ? `${name.slice(0, 3)}/${y.slice(2)}` : `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
};
const shift = (m: string, d: number) => {
  const [y, mm] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mm - 1 + d, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
};

type Row = { name: string; count: number; revenue: number; profit: number };

export function DreView({
  month,
  current,
  previous,
  series,
  breakdown,
}: {
  month: string;
  current: Dre;
  previous: Dre;
  series: { month: string; revenue: number; profit: number }[];
  breakdown: { sellers: Row[]; models: Row[] };
}) {
  const router = useRouter();
  const go = (m: string) => router.push(`/financeiro/dre?mes=${m}`);
  const pct = (v: number) => (current.netRevenue ? `${((v / current.netRevenue) * 100).toFixed(1).replace(".", ",")}%` : "—");

  function exportDre() {
    const rows = current.lines.flatMap((l) => [
      { linha: l.label, atual: l.value, anterior: previous.lines.find((p) => p.key === l.key)?.value ?? 0 },
      ...(l.children ?? []).map((c) => ({ linha: `   ${c.label}`, atual: c.value, anterior: previous.lines.find((p) => p.key === l.key)?.children?.find((x) => x.label === c.label)?.value ?? 0 })),
    ]);
    exportExcel(
      rows,
      [
        { header: "Linha", value: (r) => r.linha },
        { header: monthLabel(month), value: (r) => r.atual / 100 },
        { header: monthLabel(shift(month, -1)), value: (r) => r.anterior / 100 },
      ],
      `dre-${month}`,
      "DRE",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-lg" onClick={() => go(shift(month, -1))} aria-label="Mês anterior">
          <ChevronLeft />
        </Button>
        <span className="min-w-44 text-center text-lg font-semibold">{monthLabel(month)}</span>
        <Button variant="outline" size="icon-lg" onClick={() => go(shift(month, 1))} aria-label="Próximo mês">
          <ChevronRight />
        </Button>
        <Button variant="outline" size="lg" className="ml-auto" onClick={exportDre}>
          <Download /> Excel
        </Button>
        <Button variant="outline" size="lg" onClick={() => window.print()}>
          Imprimir / PDF
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Demonstrativo</th>
                  <th className="px-3 py-3 text-right font-medium capitalize">{monthLabel(month, true)}</th>
                  <th className="px-3 py-3 text-right font-medium">% rec.</th>
                  <th className="px-5 py-3 text-right font-medium capitalize">{monthLabel(shift(month, -1), true)}</th>
                </tr>
              </thead>
              <tbody>
                {current.lines.map((l) => {
                  const prev = previous.lines.find((p) => p.key === l.key)?.value ?? 0;
                  return (
                    <Fragment key={l.key}>
                      <tr className={cn("border-b last:border-0", l.strong && "bg-muted/40")}>
                        <td className={cn("px-5 py-2.5", l.strong ? "font-semibold" : "pl-8 text-muted-foreground")}>{l.label}</td>
                        <td className={cn("px-3 py-2.5 text-right tabular", l.strong && "font-semibold", l.key === "netProfit" && (l.value < 0 ? "text-destructive" : "text-emerald-600"))}>{formatBRL(l.value)}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular">{l.key === "gross" ? "" : pct(l.value)}</td>
                        <td className="px-5 py-2.5 text-right text-muted-foreground tabular">{formatBRL(prev)}</td>
                      </tr>
                      {l.children?.map((c) => (
                        <tr key={c.label} className="border-b text-xs last:border-0">
                          <td className="py-1.5 pr-5 pl-12 text-muted-foreground">{c.label}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular">{formatBRL(c.value)}</td>
                          <td />
                          <td className="px-5 py-1.5 text-right text-muted-foreground tabular">{formatBRL(previous.lines.find((p) => p.key === l.key)?.children?.find((x) => x.label === c.label)?.value ?? 0)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Últimos 6 meses</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Legend items={[{ label: "Receita líquida", color: SERIES[0] }, { label: "Lucro líquido", color: SERIES[2] }]} />
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series.map((s) => ({ ...s, label: monthLabel(s.month, true) }))} barGap={2} margin={{ left: 0, right: 4, top: 8 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} tickFormatter={brlShort} width={52} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar dataKey="revenue" name="Receita líquida" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} onClick={(d) => go((d as unknown as { month: string }).month)} className="cursor-pointer" />
                    <Bar dataKey="profit" name="Lucro líquido" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={22} onClick={(d) => go((d as unknown as { month: string }).month)} className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <BreakdownCard title="Lucro por vendedor" rows={breakdown.sellers} unit="vendas" />
        </div>
      </div>
      <BreakdownCard title="Lucro por modelo (aparelhos)" rows={breakdown.models} unit="un." />
    </div>
  );
}

function BreakdownCard({ title, rows, unit }: { title: string; rows: Row[]; unit: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem vendas no mês.</p>
        ) : (
          <div className="divide-y text-sm">
            {rows.map((r) => (
              <div key={r.name} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {r.name} <span className="text-xs text-muted-foreground">· {r.count} {unit}</span>
                </span>
                <span className="text-right">
                  <span className={cn("font-semibold tabular", r.profit < 0 && "text-destructive")}>{formatBRL(r.profit)}</span>
                  <span className="block text-xs text-muted-foreground tabular">
                    de {formatBRL(r.revenue)} · {r.revenue ? ((r.profit / r.revenue) * 100).toFixed(1).replace(".", ",") : 0}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
