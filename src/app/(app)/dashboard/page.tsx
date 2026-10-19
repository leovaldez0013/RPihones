import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Cake,
  CircleDollarSign,
  ListTodo,
  Package,
  PackageSearch,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  Wallet,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatLongDate } from "@/lib/format";
import { formatBRL } from "@/domain/money";
import { ORDER_STATUS, SO_STATUS } from "@/domain/constants";
import { SO_BOARD } from "@/domain/service-order";
import { getDashboard, pctDelta } from "@/features/dashboard/queries";
import { generateAutoTasks } from "@/features/marketing/service";
import { cn } from "@/lib/utils";
import { RevenueChart } from "./revenue-chart";
import { TypeChart } from "./type-chart";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Section({ title, href, linkLabel = "Ver tudo", icon: Icon, children, className }: { title: string; href?: string; linkLabel?: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {title}
        </CardTitle>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {linkLabel} <ArrowRight className="size-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Metric({ label, value, href, tone }: { label: string; value: React.ReactNode; href?: string; tone?: "red" | "amber" }) {
  const body = (
    <div className={cn("rounded-xl bg-muted/50 p-3", href && "transition hover:bg-muted")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular", tone === "red" && "text-red-600 dark:text-red-400", tone === "amber" && "text-amber-600 dark:text-amber-400")}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const user = await requirePage("dashboard.view");
  await generateAutoTasks(db);
  const d = await getDashboard(user);
  const showSales = can(user.role, "sales.view");
  const k = d.kpis;
  const maxModel = Math.max(1, ...d.topModels.map((m) => m.count));
  const maxSeller = Math.max(1, ...d.sellerRanking.map((s) => s.total));
  const soOpen = Object.values(d.serviceOrders.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${greeting()}, ${user.name.split(" ")[0]}`} description={`${formatLongDate(new Date())}${d.ownOnly && showSales ? " · seus números" : ""}`} />

      {showSales ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Vendas hoje" value={formatBRL(k.today.revenue)} icon={ShoppingBag} delta={pctDelta(k.today.revenue, k.today.prevRevenue)} hint={`${k.today.count} venda(s) · vs. ontem`} />
          <StatCard label="Faturamento do mês" value={formatBRL(k.month.revenue)} icon={TrendingUp} tone="blue" delta={pctDelta(k.month.revenue, k.month.prevRevenue)} hint={`${k.month.count} vendas · vs. mesmo período`} />
          <StatCard label="Ticket médio" value={formatBRL(k.month.ticket)} icon={Receipt} tone="amber" delta={pctDelta(k.month.ticket, k.month.prevTicket)} hint="no mês" />
          {d.financial ? (
            <StatCard label="Lucro do mês" value={formatBRL(k.month.profit)} icon={CircleDollarSign} tone="green" delta={pctDelta(k.month.profit ?? 0, k.month.prevProfit ?? 0)} hint="vendas + serviços, após custos, taxas e comissões" />
          ) : (
            <StatCard label="Minha comissão no mês" value={formatBRL(k.month.commission)} icon={CircleDollarSign} tone="green" hint="vendas concluídas" />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="OS abertas" value={soOpen} icon={Wrench} />
          <StatCard label="OS atrasadas" value={d.serviceOrders.late} icon={AlertTriangle} tone={d.serviceOrders.late ? "red" : "green"} />
          <StatCard label="Aguardando peça" value={d.serviceOrders.byStatus.AGUARDANDO_PECA ?? 0} icon={Package} tone="amber" />
          <StatCard label="Prontas para entrega" value={d.serviceOrders.byStatus.PRONTA ?? 0} icon={Wrench} tone="green" />
        </div>
      )}

      {showSales && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Serviços no mês" value={formatBRL(k.month.servicesRevenue)} icon={Wrench} tone="blue" delta={pctDelta(k.month.servicesRevenue, k.month.prevServicesRevenue)} hint={`${k.month.servicesCount} OS entregue(s)`} />
          <StatCard label="Sinais de encomendas" value={formatBRL(k.month.deposits)} icon={PackageSearch} hint={`${k.month.depositsCount} recebido(s) no mês`} />
          <StatCard
            label="OS abertas"
            value={soOpen}
            icon={AlertTriangle}
            tone={d.serviceOrders.late ? "red" : "default"}
            hint={<Link href="/os" className="hover:underline">{d.serviceOrders.late} atrasada(s)</Link>}
          />
          <StatCard label="Garantias vencendo" value={d.warrantiesExpiring} icon={ShieldCheck} tone={d.warrantiesExpiring ? "amber" : "default"} hint={<Link href="/garantias?aba=vencendo" className="hover:underline">nos próximos 7 dias</Link>} />
        </div>
      )}

      {showSales && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Vendas por dia — últimos 30 dias" href="/vendas" linkLabel="Vendas" className="lg:col-span-2">
            <RevenueChart data={d.days} />
          </Section>
          <Section title="Mais vendidos no mês" icon={Smartphone} href={can(user.role, "reports.view") ? "/relatorios?tipo=margem" : undefined} linkLabel="Relatórios">
            {d.topModels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum aparelho vendido ainda este mês.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {d.topModels.map((m) => (
                  <li key={m.name} className="text-sm">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground tabular">
                        {m.count} un · {formatBRL(m.revenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full" style={{ width: `${(m.count / maxModel) * 100}%`, background: "var(--series-1)" }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      )}

      {showSales && (
        <Section title="Faturamento por tipo — vendas × serviços (30 dias)" href={can(user.role, "reports.view") ? "/relatorios" : undefined} linkLabel="Relatórios">
          <TypeChart data={d.days} />
        </Section>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Estoque" icon={Package} href="/estoque/aparelhos">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Aparelhos em estoque" value={d.stock.inStock} />
            <Metric label="Disponíveis" value={d.stock.available} href="/estoque/aparelhos" />
            <Metric label="Reservados" value={d.stock.reserved} />
            <Metric label="Em manutenção/preparo" value={d.stock.maintenance} href="/os" />
            <Metric label={`Parados há +${d.stock.staleDays} dias`} value={d.stock.stale} tone={d.stock.stale ? "amber" : undefined} href="/estoque/aparelhos?filtro=parados" />
            <Metric label={d.stock.cost != null ? "Valor (custo)" : "Valor de venda"} value={formatBRL(d.stock.cost ?? d.stock.price)} />
          </div>
          {d.stock.lowAccessories.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3.5" /> Acessórios/peças em estoque mínimo
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                {d.stock.lowAccessories.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <Link href={`/estoque/acessorios?q=${encodeURIComponent(a.sku)}`} className="truncate hover:underline">
                      {a.name}
                    </Link>
                    <span className={cn("shrink-0 tabular", a.quantity === 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {a.quantity}/{a.minStock}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Ordens de serviço" icon={Wrench} href="/os">
          <div className="grid grid-cols-2 gap-2">
            {SO_BOARD.map((s) => (
              <Metric key={s} label={SO_STATUS.label(s)} value={d.serviceOrders.byStatus[s] ?? 0} href="/os" />
            ))}
            <Metric label="Atrasadas" value={d.serviceOrders.late} tone={d.serviceOrders.late ? "red" : undefined} href="/os" />
          </div>
        </Section>

        {can(user.role, "orders.view") && (
          <Section title="Encomendas" icon={PackageSearch} href="/encomendas">
            <p className="text-sm text-muted-foreground">
              <strong className="text-2xl font-semibold text-foreground tabular">{d.orders.open}</strong> em andamento
            </p>
            {d.orders.arrived.length > 0 ? (
              <div className="mt-3 flex flex-col divide-y text-sm">
                {d.orders.arrived.slice(0, 5).map((o) => (
                  <Link key={o.id} href={`/encomendas/${o.id}`} className="flex items-center justify-between gap-2 py-2 hover:underline">
                    <span className="min-w-0 truncate">
                      #{o.number} {o.customer.split(" ")[0]} — {o.model}
                    </span>
                    <StatusBadge value={o.status} options={ORDER_STATUS} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Nenhum aparelho aguardando retirada.</p>
            )}
          </Section>
        )}

        {d.finance && (
          <Section title="Contas dos próximos 7 dias" icon={Banknote} href="/financeiro">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="A receber" value={formatBRL(d.finance.receiveTotal)} />
              <Metric label="A pagar" value={formatBRL(d.finance.payTotal)} tone={d.finance.payables.some((p) => p.overdue) ? "red" : undefined} />
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {d.finance.payables.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.description}</span>
                  <span className={cn("shrink-0 text-xs tabular", p.overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                    {formatBRL(p.amount)} · {p.overdue ? "vencida" : formatDate(p.dueDate).slice(0, 5)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {d.finance && (
          <Section title="Saldos" icon={Wallet} href="/financeiro/contas">
            <ul className="flex flex-col gap-2 text-sm">
              {d.finance.balances.map((b) => (
                <li key={b.id} className="flex justify-between gap-2">
                  <span>{b.name}</span>
                  <span className={cn("font-medium tabular", b.balance < 0 && "text-red-600 dark:text-red-400")}>{formatBRL(b.balance)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {can(user.role, "cash.operate") && (
          <Section title="Meu caixa" icon={Wallet} href="/financeiro/caixa" linkLabel={d.cash ? "Abrir" : "Abrir caixa"}>
            {d.cash ? (
              <p className="text-sm">
                <StatusBadge tone="green">Aberto</StatusBadge> <span className="text-muted-foreground">desde {formatDateTime(d.cash.openedAt)} · {d.cash.account}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Caixa fechado. Abra antes de receber em dinheiro.</p>
            )}
          </Section>
        )}

        {can(user.role, "marketing.view") && (
          <Section title="Pós-venda" icon={ListTodo} href="/marketing" linkLabel="Tarefas">
            <p className="text-sm text-muted-foreground">
              <strong className={cn("text-2xl font-semibold tabular", d.tasksToday ? "text-foreground" : "text-emerald-600")}>{d.tasksToday}</strong> tarefa(s) para hoje
            </p>
            {d.birthdays.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Cake className="size-3.5" /> Aniversariantes da semana
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {d.birthdays.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex justify-between gap-2">
                      <Link href={`/clientes/${b.id}`} className="truncate hover:underline">
                        {b.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{b.days === 0 ? "hoje 🎉" : b.days === 1 ? "amanhã" : `em ${b.days} dias`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {d.sellerRanking.length > 0 && (
          <Section title="Vendas por vendedor (mês)" icon={TrendingUp} href={can(user.role, "finance.view") ? "/financeiro/comissoes" : undefined} linkLabel="Comissões">
            <ol className="flex flex-col gap-3">
              {d.sellerRanking.map((s) => (
                <li key={s.name} className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {s.count} · {formatBRL(s.total)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full" style={{ width: `${(s.total / maxSeller) * 100}%`, background: "var(--series-1)" }} />
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>
    </div>
  );
}
