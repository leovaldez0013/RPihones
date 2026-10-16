import { db } from "@/lib/db";
import { computeDre, type DreExpense } from "@/domain/dre";
import { sum } from "@/domain/money";

/** Intervalo de um mês (yyyy-mm) no fuso de São Paulo. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(`${month}-01T00:00:00-03:00`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const end = new Date(`${next}-01T00:00:00-03:00`);
  return { start, end };
}

export function currentMonth(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function accountBalances() {
  const [accounts, sums] = await Promise.all([
    db.financialAccount.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.financialEntry.groupBy({ by: ["accountId", "type", "status"], where: { deletedAt: null, accountId: { not: null } }, _sum: { netAmount: true } }),
  ]);
  return accounts.map((a) => {
    const get = (type: string, status: string) => sums.find((s) => s.accountId === a.id && s.type === type && s.status === status)?._sum.netAmount ?? 0;
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      active: a.active,
      initialBalance: a.initialBalance,
      balance: a.initialBalance + get("RECEBER", "PAGA") - get("PAGAR", "PAGA"),
      toReceive: get("RECEBER", "ABERTA"),
      toPay: get("PAGAR", "ABERTA"),
    };
  });
}

/** Fluxo de caixa: realizado (por data de pagamento) e previsto (em aberto, por vencimento). Transferências internas ficam de fora. */
export async function cashFlow(from: Date, to: Date, granularity: "day" | "month") {
  const notTransfer = { OR: [{ categoryId: null }, { category: { dreGroup: { not: "TRANSFERENCIA" } } }] };
  const [realized, forecast, before, accounts] = await Promise.all([
    db.financialEntry.findMany({ where: { deletedAt: null, status: "PAGA", paidAt: { gte: from, lt: to }, ...notTransfer }, select: { type: true, netAmount: true, paidAt: true } }),
    db.financialEntry.findMany({ where: { deletedAt: null, status: "ABERTA", dueDate: { lt: to }, ...notTransfer }, select: { type: true, netAmount: true, dueDate: true } }),
    db.financialEntry.groupBy({ by: ["type"], where: { deletedAt: null, status: "PAGA", paidAt: { lt: from } }, _sum: { netAmount: true } }),
    db.financialAccount.aggregate({ where: { deletedAt: null }, _sum: { initialBalance: true } }),
  ]);
  const key = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return granularity === "day" ? p : p.slice(0, 7);
  };
  const today = key(new Date());
  const buckets = new Map<string, { inReal: number; outReal: number; inPrev: number; outPrev: number }>();
  const cursor = new Date(from);
  while (cursor < to) {
    buckets.set(key(cursor), { inReal: 0, outReal: 0, inPrev: 0, outPrev: 0 });
    if (granularity === "day") cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const e of realized) {
    const b = buckets.get(key(e.paidAt!));
    if (!b) continue;
    if (e.type === "RECEBER") b.inReal += e.netAmount;
    else b.outReal += e.netAmount;
  }
  for (const e of forecast) {
    // vencidos e não pagos aparecem no dia de hoje (ainda são esperados)
    const k = e.dueDate < new Date() ? today : key(e.dueDate);
    const b = buckets.get(k);
    if (!b) continue;
    if (e.type === "RECEBER") b.inPrev += e.netAmount;
    else b.outPrev += e.netAmount;
  }
  const get = (t: string) => before.find((b) => b.type === t)?._sum.netAmount ?? 0;
  let balance = (accounts._sum.initialBalance ?? 0) + get("RECEBER") - get("PAGAR");
  const opening = balance;
  const rows = [...buckets.entries()].map(([period, b]) => {
    balance += b.inReal - b.outReal + b.inPrev - b.outPrev;
    return { period, ...b, balance };
  });
  return { opening, rows };
}

export async function dreForMonth(month: string) {
  const { start, end } = monthRange(month);
  const [sales, services, expenses] = await Promise.all([
    db.sale.findMany({ where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: start, lt: end } } }),
    db.serviceOrder.findMany({ where: { deletedAt: null, kind: "CLIENTE", status: "ENTREGUE", deliveredAt: { gte: start, lt: end } }, include: { parts: true } }),
    db.financialEntry.findMany({
      where: { deletedAt: null, status: { not: "CANCELADA" }, dueDate: { gte: start, lt: end }, category: { dreGroup: { in: ["DESPESA_OPERACIONAL", "OUTRAS"] } } },
      include: { category: true },
    }),
  ]);
  return computeDre({
    sales: sales.map((s) => ({ subtotal: s.subtotal, discounts: s.itemDiscount + s.discount, interest: s.interest, cost: s.cost, cardFees: s.cardFees, commission: s.commission })),
    services: services.map((o) => ({ price: o.price, cost: o.laborCost + sum(o.parts.map((p) => p.unitCost * p.quantity)) })),
    expenses: expenses.map((e): DreExpense => ({ group: e.category!.dreGroup, category: e.category!.name, amount: e.amount, kind: e.type === "RECEBER" ? "RECEITA" : "DESPESA" })),
  });
}

/** Lucro por vendedor e por modelo no mês. */
export async function profitBreakdown(month: string) {
  const { start, end } = monthRange(month);
  const sales = await db.sale.findMany({
    where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: start, lt: end } },
    include: { seller: true, items: { include: { device: { include: { model: true } } } } },
  });
  const bySeller = new Map<string, { name: string; count: number; revenue: number; profit: number }>();
  const byModel = new Map<string, { name: string; count: number; revenue: number; profit: number }>();
  for (const s of sales) {
    const profit = s.total - s.cost - s.cardFees - s.commission;
    const sel = bySeller.get(s.sellerId) ?? { name: s.seller.name, count: 0, revenue: 0, profit: 0 };
    sel.count++;
    sel.revenue += s.total;
    sel.profit += profit;
    bySeller.set(s.sellerId, sel);
    for (const i of s.items.filter((x) => x.device)) {
      const name = i.device!.model.name;
      const m = byModel.get(name) ?? { name, count: 0, revenue: 0, profit: 0 };
      const net = i.unitPrice - i.discount;
      m.count++;
      m.revenue += net;
      m.profit += net - i.unitCost;
      byModel.set(name, m);
    }
  }
  return {
    sellers: [...bySeller.values()].sort((a, b) => b.profit - a.profit),
    models: [...byModel.values()].sort((a, b) => b.profit - a.profit),
  };
}

export async function commissionsForMonth(month: string) {
  const { start, end } = monthRange(month);
  const [sales, paid] = await Promise.all([
    db.sale.groupBy({ by: ["sellerId"], where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: start, lt: end } }, _sum: { commission: true, total: true }, _count: true }),
    db.financialEntry.findMany({ where: { deletedAt: null, originType: "COMISSAO", originId: { endsWith: `|${month}` }, status: "PAGA" } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: sales.map((s) => s.sellerId) } }, select: { id: true, name: true } });
  return sales
    .map((s) => {
      const paidAmount = paid.filter((p) => p.originId === `${s.sellerId}|${month}`).reduce((a, p) => a + p.amount, 0);
      const commission = s._sum.commission ?? 0;
      return {
        sellerId: s.sellerId,
        seller: users.find((u) => u.id === s.sellerId)?.name ?? "—",
        sales: s._count,
        total: s._sum.total ?? 0,
        commission,
        paid: paidAmount,
        pending: Math.max(0, commission - paidAmount),
      };
    })
    .sort((a, b) => b.commission - a.commission);
}
