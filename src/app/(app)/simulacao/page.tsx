import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDollarSign, FlaskConical, Package, Receipt, ShoppingBag, TrendingUp, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatDateTime, formatPct } from "@/lib/format";
import { formatBRL } from "@/domain/money";
import { simulationStatus } from "@/features/simulation/service";
import { monthSummary } from "@/features/simulation/summary";
import { RevenueChart } from "../dashboard/revenue-chart";
import { SimulationControls } from "./controls";
import { TestReportCard } from "./test-report";
import { lastReport } from "@/features/simulation/selftest";

export const metadata: Metadata = { title: "Simulação" };

function Ranking({ items, empty }: { items: { name: string; count: number; revenue: number }[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ol className="flex flex-col gap-3">
      {items.map((m) => (
        <li key={m.name} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="font-medium">{m.name}</span>
            <span className="text-xs text-muted-foreground tabular">
              {m.count} un · {formatBRL(m.revenue)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full" style={{ width: `${(m.count / max) * 100}%`, background: "var(--series-1)" }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function SimulationPage() {
  const user = await requirePage("dashboard.view");
  const status = simulationStatus();
  const canManage = can(user.role, "simulation.manage");
  const s = status.active ? await monthSummary(15) : null;
  const report = lastReport();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Simulação de 1 mês"
        description="Teste o sistema com 30 dias de operação fictícia antes de usar de verdade. A simulação fica num banco separado: o estoque e as vendas reais nunca são tocados."
        actions={canManage && <SimulationControls status={{ supported: status.supported, exists: status.exists, active: status.active }} />}
      />

      {!status.supported && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">A simulação funciona com o banco local (SQLite). Em produção, use um banco de testes separado.</CardContent>
        </Card>
      )}

      {status.supported && !status.active && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 text-sm">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FlaskConical className="size-5" />
            </span>
            {status.exists ? (
              <p>
                Há uma simulação guardada{status.meta ? ` (gerada em ${formatDateTime(status.meta.generatedAt)})` : ""}. Você está vendo os <strong>dados reais</strong>. Use “Voltar à simulação” para revê-la ou “Apagar simulação” para descartá-la.
              </p>
            ) : (
              <>
                <p className="max-w-2xl">
                  Ao gerar, o sistema cria 40 a 60 entradas de aparelhos espalhadas pelos últimos 30 dias (mais da linha 17 e 18), cerca de 30% sem IMEI, vendas em 60 a 70% deles com dias fortes e dias parados, e três casos para testar os avisos de IMEI.
                </p>
                <p className="text-muted-foreground">Enquanto a simulação estiver ativa, aparece a faixa “MODO SIMULAÇÃO” no topo e tudo o que você fizer fica só nela.</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {status.supported && <TestReportCard report={report} canRun={canManage} />}

      {s && status.meta && (
        <>
          <p className="text-sm text-muted-foreground">
            Gerada em {formatDateTime(status.meta.generatedAt)} por {status.meta.generatedBy} · {status.meta.customers} clientes · {status.meta.devices} entradas ({status.meta.withoutImei} sem IMEI) · {status.meta.sales} vendas ({status.meta.tradeIns} com troca, {status.meta.canceledSales} devolvida) · {status.meta.serviceOrders} OS · {status.meta.orders} encomendas · {status.meta.claims} acionamentos de garantia · {status.meta.tacs} TACs simulados
            {status.meta.skipped.length > 0 && ` · ${status.meta.skipped.length} item(ns) ignorado(s)`}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total vendido" value={`${s.devicesSold} aparelhos`} icon={ShoppingBag} hint={`${s.count} vendas · ${s.noSaleDays} dia(s) sem venda`} />
            <StatCard label="Faturamento" value={formatBRL(s.revenue)} icon={TrendingUp} tone="blue" />
            <StatCard label="Lucro" value={formatBRL(s.profit)} icon={CircleDollarSign} tone="green" hint={`margem ${formatPct(s.margin)} · após custo, taxas e comissões`} />
            <StatCard label="Ticket médio" value={formatBRL(s.ticket)} icon={Receipt} tone="amber" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Vendas por dia</CardTitle>
              </CardHeader>
              <CardContent>
                <RevenueChart data={s.days} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="size-4 text-muted-foreground" /> Estoque restante
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: "Aparelhos em estoque", value: s.stock.count },
                  { label: "Sem IMEI", value: s.stock.withoutImei },
                  { label: "Parados há +15 dias", value: s.stock.stale, tone: s.stock.stale ? "text-amber-600 dark:text-amber-400" : "" },
                  { label: "Valor (custo)", value: formatBRL(s.stock.cost) },
                ].map((m) => (
                  <Link key={m.label} href="/estoque/aparelhos" className="rounded-xl bg-muted/50 p-3 transition hover:bg-muted">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className={`mt-0.5 text-lg font-semibold tabular ${m.tone ?? ""}`}>{m.value}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Modelos mais vendidos</CardTitle>
              </CardHeader>
              <CardContent>
                <Ranking items={s.topModels} empty="Nenhuma venda." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cores mais vendidas</CardTitle>
              </CardHeader>
              <CardContent>
                <Ranking items={s.topColors} empty="Nenhuma venda." />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-muted-foreground" /> Casos para testar os avisos de IMEI
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {status.meta.cases.map((c) => (
                <div key={c.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {c.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}
                      {c.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.detail} · IMEI <span className="font-mono">{c.imei}</span>
                    </p>
                    <p className="text-xs">
                      Resposta do sistema: <span className="font-medium">“{c.result}”</span>
                    </p>
                  </div>
                  <Link href={`/estoque/aparelhos/novo?imei=${c.imei}`} className="shrink-0 text-sm text-primary hover:underline">
                    Testar no cadastro →
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
