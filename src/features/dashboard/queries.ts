// Indicadores do dashboard. Comparações: hoje × ontem e mês até hoje × mesmo período do mês anterior.
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";
import { zoned } from "@/lib/format";
import { daysUntilBirthday } from "@/domain/marketing";
import { accountBalances } from "@/features/finance/queries";

const DAY = 86400000;

/** Início do dia (00:00 em São Paulo) deslocado em `offset` dias. */
export function spDayStart(now: Date, offset = 0) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  return new Date(new Date(`${ymd}T00:00:00-03:00`).getTime() + offset * DAY);
}

export function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

type SaleLite = { total: number; cost: number; cardFees: number; commission: number; completedAt: Date | null };
const sumBy = (rows: SaleLite[], f: (s: SaleLite) => number) => rows.reduce((a, s) => a + f(s), 0);
const profit = (s: SaleLite) => s.total - s.cost - s.cardFees - s.commission;

export async function getDashboard(user: SessionUser) {
  const now = new Date();
  const financial = can(user.role, "dashboard.financial");
  const sellerFilter = can(user.role, "sales.viewAll") ? {} : { sellerId: user.id };
  const today = spDayStart(now);
  const yesterday = spDayStart(now, -1);
  const z = zoned(now)!;
  const monthStart = new Date(`${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-01T00:00:00-03:00`);
  const prevMonth = new Date(z.getFullYear(), z.getMonth() - 1, 1);
  const prevMonthStart = new Date(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01T00:00:00-03:00`);
  // mesmo ponto do mês anterior (limitado ao fim dele)
  const prevSameDay = new Date(Math.min(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()), monthStart.getTime()));
  const chartStart = spDayStart(now, -29);
  const settings = await db.storeSettings.findUnique({ where: { id: "default" }, select: { staleStockDays: true } });
  const staleDays = settings?.staleStockDays ?? 45;

  const saleSelect = { total: true, cost: true, cardFees: true, commission: true, completedAt: true } as const;
  const [recent, prevPeriod, monthItems, sellers, stock, staleCount, lowAccessories, orders, soCounts, soLate, tasksToday, birthdayPeople, openCash] = await Promise.all([
    db.sale.findMany({ where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: new Date(Math.min(chartStart.getTime(), monthStart.getTime())) }, ...sellerFilter }, select: saleSelect }),
    db.sale.findMany({ where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: prevMonthStart, lt: prevSameDay }, ...sellerFilter }, select: saleSelect }),
    db.saleItem.findMany({
      where: { active: true, kind: "DEVICE", sale: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: monthStart }, ...sellerFilter } },
      select: { unitPrice: true, discount: true, device: { select: { model: { select: { name: true } } } } },
    }),
    can(user.role, "sales.viewAll")
      ? db.sale.groupBy({ by: ["sellerId"], where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: monthStart } }, _sum: { total: true }, _count: true })
      : Promise.resolve([]),
    db.device.groupBy({ by: ["status"], where: { deletedAt: null, status: { not: "VENDIDO" } }, _count: true, _sum: { acquisitionCost: true, serviceCost: true, salePrice: true } }),
    db.device.count({ where: { deletedAt: null, status: "DISPONIVEL", entryDate: { lt: new Date(now.getTime() - staleDays * DAY) } } }),
    db.accessory.findMany({ where: { deletedAt: null, active: true, minStock: { gt: 0 } }, select: { id: true, name: true, quantity: true, minStock: true, sku: true } }),
    can(user.role, "orders.view")
      ? db.order.findMany({ where: { deletedAt: null, status: { notIn: ["ENTREGUE", "CANCELADA"] } }, include: { customer: true }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    db.serviceOrder.groupBy({ by: ["status"], where: { deletedAt: null, status: { notIn: ["ENTREGUE", "CANCELADA"] } }, _count: true }),
    db.serviceOrder.count({ where: { deletedAt: null, status: { notIn: ["ENTREGUE", "CANCELADA"] }, dueDate: { lt: today } } }),
    can(user.role, "marketing.view")
      ? db.task.count({ where: { doneAt: null, dueDate: { lt: spDayStart(now, 1) }, ...(can(user.role, "sales.viewAll") ? {} : { OR: [{ userId: user.id }, { userId: null }] }) } })
      : Promise.resolve(0),
    can(user.role, "customers.view") ? db.customer.findMany({ where: { deletedAt: null, birthDate: { not: null } }, select: { id: true, name: true, birthDate: true, marketingConsent: true } }) : Promise.resolve([]),
    can(user.role, "cash.operate") ? db.cashSession.findFirst({ where: { userId: user.id, closedAt: null }, include: { account: true } }) : Promise.resolve(null),
  ]);

  const inRange = (from: Date, to?: Date) => recent.filter((s) => s.completedAt! >= from && (!to || s.completedAt! < to));
  const todaySales = inRange(today);
  const yesterdaySales = inRange(yesterday, today);
  const monthSales = inRange(monthStart);

  // série diária (30 dias)
  const days: { day: string; label: string; revenue: number; count: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const start = new Date(chartStart.getTime() + i * DAY);
    const end = new Date(start.getTime() + DAY);
    const list = recent.filter((s) => s.completedAt! >= start && s.completedAt! < end);
    const zd = zoned(start)!;
    days.push({ day: start.toISOString(), label: `${String(zd.getDate()).padStart(2, "0")}/${String(zd.getMonth() + 1).padStart(2, "0")}`, revenue: sumBy(list, (s) => s.total), count: list.length });
  }

  const byModel = new Map<string, { name: string; count: number; revenue: number }>();
  for (const i of monthItems) {
    const name = i.device?.model.name ?? "Outro";
    const m = byModel.get(name) ?? { name, count: 0, revenue: 0 };
    m.count++;
    m.revenue += i.unitPrice - i.discount;
    byModel.set(name, m);
  }
  const topModels = [...byModel.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue).slice(0, 6);

  const users = sellers.length ? await db.user.findMany({ where: { id: { in: sellers.map((s) => s.sellerId) } }, select: { id: true, name: true } }) : [];
  const sellerRanking = sellers
    .map((s) => ({ name: users.find((u) => u.id === s.sellerId)?.name ?? "—", total: s._sum.total ?? 0, count: s._count }))
    .sort((a, b) => b.total - a.total);

  const stockBy = (st: string) => stock.find((s) => s.status === st);
  const inStock = stock.reduce((a, s) => a + s._count, 0);
  const stockCost = stock.reduce((a, s) => a + (s._sum.acquisitionCost ?? 0) + (s._sum.serviceCost ?? 0), 0);
  const stockPrice = stock.reduce((a, s) => a + (s._sum.salePrice ?? 0), 0);

  const birthdays = birthdayPeople
    .map((c) => ({ id: c.id, name: c.name, consent: c.marketingConsent, days: daysUntilBirthday(c.birthDate!, z) }))
    .filter((c) => c.days <= 7)
    .sort((a, b) => a.days - b.days);

  let finance: null | {
    balances: Awaited<ReturnType<typeof accountBalances>>;
    payables: { id: string; description: string; amount: number; dueDate: Date; overdue: boolean }[];
    receivables: { id: string; description: string; amount: number; dueDate: Date; overdue: boolean }[];
    payTotal: number;
    receiveTotal: number;
  } = null;
  if (financial) {
    const horizon = spDayStart(now, 8);
    const [balances, entries] = await Promise.all([
      accountBalances(),
      db.financialEntry.findMany({ where: { deletedAt: null, status: "ABERTA", dueDate: { lt: horizon } }, orderBy: { dueDate: "asc" }, select: { id: true, type: true, description: true, netAmount: true, dueDate: true } }),
    ]);
    const map = (e: (typeof entries)[number]) => ({ id: e.id, description: e.description, amount: e.netAmount, dueDate: e.dueDate, overdue: e.dueDate < today });
    const pay = entries.filter((e) => e.type === "PAGAR");
    const rec = entries.filter((e) => e.type === "RECEBER");
    finance = {
      balances: balances.filter((b) => b.active),
      payables: pay.slice(0, 5).map(map),
      receivables: rec.slice(0, 5).map(map),
      payTotal: pay.reduce((a, e) => a + e.netAmount, 0),
      receiveTotal: rec.reduce((a, e) => a + e.netAmount, 0),
    };
  }

  const ticket = (l: SaleLite[]) => (l.length ? Math.round(sumBy(l, (s) => s.total) / l.length) : 0);

  return {
    financial,
    ownOnly: !can(user.role, "sales.viewAll"),
    kpis: {
      today: { revenue: sumBy(todaySales, (s) => s.total), count: todaySales.length, prevRevenue: sumBy(yesterdaySales, (s) => s.total) },
      month: {
        revenue: sumBy(monthSales, (s) => s.total),
        prevRevenue: sumBy(prevPeriod, (s) => s.total),
        count: monthSales.length,
        prevCount: prevPeriod.length,
        ticket: ticket(monthSales),
        prevTicket: ticket(prevPeriod),
        profit: financial ? sumBy(monthSales, profit) : null,
        prevProfit: financial ? sumBy(prevPeriod, profit) : null,
        commission: sumBy(monthSales, (s) => s.commission),
      },
    },
    days,
    topModels,
    sellerRanking,
    stock: {
      inStock,
      available: stockBy("DISPONIVEL")?._count ?? 0,
      reserved: stockBy("RESERVADO")?._count ?? 0,
      maintenance: (stockBy("EM_MANUTENCAO")?._count ?? 0) + (stockBy("EM_AVALIACAO")?._count ?? 0),
      cost: financial ? stockCost : null,
      price: stockPrice,
      stale: staleCount,
      staleDays,
      lowAccessories: lowAccessories.filter((a) => a.quantity <= a.minStock).sort((a, b) => a.quantity - b.quantity),
    },
    orders: {
      open: orders.length,
      arrived: orders.filter((o) => ["CHEGOU", "CLIENTE_AVISADO"].includes(o.status)).map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, model: o.modelName, status: o.status })),
    },
    serviceOrders: { byStatus: Object.fromEntries(soCounts.map((s) => [s.status, s._count])) as Record<string, number>, late: soLate },
    tasksToday,
    birthdays,
    cash: openCash ? { id: openCash.id, openedAt: openCash.openedAt, account: openCash.account.name } : null,
    finance,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
