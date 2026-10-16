"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/shared/data-table";
import { ChartTooltip, Legend, SERIES, axisProps, brlShort, gridProps } from "@/components/charts/chart-kit";
import { formatBRL } from "@/domain/money";
import { cn } from "@/lib/utils";

type Row = { period: string; inReal: number; outReal: number; inPrev: number; outPrev: number; balance: number };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function label(period: string, monthly: boolean) {
  const [y, m, d] = period.split("-");
  return monthly ? `${MONTHS[Number(m) - 1]}/${y.slice(2)}` : `${d}/${m}`;
}

export function CashFlowView({ monthly, opening, rows }: { monthly: boolean; opening: number; rows: Row[] }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const todayKey = monthly ? today.slice(0, 7) : today;
  const data = rows.map((r) => ({
    ...r,
    label: label(r.period, monthly),
    entradas: r.inReal + r.inPrev,
    saidas: -(r.outReal + r.outPrev),
  }));
  const totals = rows.reduce((a, r) => ({ in: a.in + r.inReal + r.inPrev, out: a.out + r.outReal + r.outPrev }), { in: 0, out: 0 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["diaria", "Diário (próximos 30 dias)"],
          ["mensal", "Mensal"],
        ].map(([v, l]) => (
          <Link
            key={v}
            href={`/financeiro/fluxo${v === "mensal" ? "?visao=mensal" : ""}`}
            className={cn("rounded-full border px-3 py-1.5 text-sm", (v === "mensal") === monthly ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {l}
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          Saldo inicial do período: <strong className="text-foreground tabular">{formatBRL(opening)}</strong>
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Entradas e saídas</p>
              <Legend items={[{ label: "Entradas", color: SERIES[0] }, { label: "Saídas", color: SERIES[1] }]} />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barGap={2} stackOffset="sign">
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis {...axisProps} tickFormatter={brlShort} width={56} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <ReferenceLine x={label(todayKey, monthly)} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "hoje", position: "top", fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Bar dataKey="entradas" name="Entradas" stackId="f" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="saidas" name="Saídas" stackId="f" fill={SERIES[1]} radius={[0, 0, 4, 4]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="font-medium">Saldo acumulado (todas as contas)</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="saldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES[2]} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={SERIES[2]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis {...axisProps} tickFormatter={brlShort} width={56} domain={["auto", "auto"]} />
                  <ReferenceLine x={label(todayKey, monthly)} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
                  <Tooltip content={<ChartTooltip />} />
                  <Area dataKey="balance" name="Saldo" stroke={SERIES[2]} strokeWidth={2} fill="url(#saldo)" type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        Antes de hoje: valores realizados. A partir de hoje: previstos (contas em aberto; vencidas não pagas aparecem hoje).
      </p>

      <DataTable
        columns={[
          { accessorKey: "period", header: monthly ? "Mês" : "Dia", cell: ({ row }) => <span className={cn("tabular", row.original.period === todayKey && "font-semibold text-primary")}>{label(row.original.period, monthly)}</span> },
          { accessorKey: "inReal", header: "Entradas realizadas", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.inReal)}</span>, meta: { className: "text-right" } },
          { accessorKey: "outReal", header: "Saídas realizadas", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.outReal)}</span>, meta: { className: "text-right" } },
          { accessorKey: "inPrev", header: "Entradas previstas", cell: ({ row }) => <span className="text-muted-foreground tabular">{formatBRL(row.original.inPrev)}</span>, meta: { className: "text-right" } },
          { accessorKey: "outPrev", header: "Saídas previstas", cell: ({ row }) => <span className="text-muted-foreground tabular">{formatBRL(row.original.outPrev)}</span>, meta: { className: "text-right" } },
          { accessorKey: "balance", header: "Saldo", cell: ({ row }) => <span className={cn("font-semibold tabular", row.original.balance < 0 && "text-destructive")}>{formatBRL(row.original.balance)}</span>, meta: { className: "text-right" } },
        ]}
        data={rows}
        pageSize={monthly ? 12 : 50}
        searchPlaceholder="Filtrar…"
        exportName="fluxo-de-caixa"
        exportDef={[
          { header: "Período", value: (r) => label(r.period, monthly) },
          { header: "Entradas realizadas", value: (r) => r.inReal / 100 },
          { header: "Saídas realizadas", value: (r) => r.outReal / 100 },
          { header: "Entradas previstas", value: (r) => r.inPrev / 100 },
          { header: "Saídas previstas", value: (r) => r.outPrev / 100 },
          { header: "Saldo", value: (r) => r.balance / 100 },
        ]}
      />
      <p className="text-right text-sm text-muted-foreground">
        Total do período: entradas <strong className="text-foreground tabular">{formatBRL(totals.in)}</strong> · saídas <strong className="text-foreground tabular">{formatBRL(totals.out)}</strong>
      </p>
    </div>
  );
}
