// Despesas operacionais recorrentes e pagamento de comissões dos meses passados.
import { db } from "../../src/lib/db";
import { commissionsForMonth, currentMonth, monthRange, shiftMonth } from "../../src/features/finance/queries";
import { int } from "./util";

const EXPENSES = [
  { key: "ALUGUEL", description: "Aluguel e condomínio da loja", amount: 850000, day: 5 },
  { key: "SALARIOS", description: "Folha de pagamento + encargos", amount: 1420000, day: 5 },
  { key: "MARKETING", description: "Anúncios Instagram/Google", amount: 180000, day: 10, vary: true },
  { key: "UTILIDADES", description: "Energia, água e internet", amount: 92000, day: 15, vary: true },
  { key: "SISTEMAS", description: "Sistemas e assinaturas", amount: 29000, day: 20 },
];

export async function seedFinanceHistory(bancoId: string, adminId: string) {
  const cats = Object.fromEntries((await db.category.findMany({ where: { key: { not: null } } })).map((c) => [c.key!, c.id]));
  const now = new Date();
  const thisMonth = currentMonth();
  let count = 0;

  for (let i = -7; i <= 1; i++) {
    const month = shiftMonth(thisMonth, i);
    const { start, end } = monthRange(month);
    for (const e of EXPENSES) {
      const due = new Date(start);
      due.setDate(e.day);
      due.setHours(12);
      const amount = e.vary ? Math.round((e.amount * int(85, 120)) / 100) : e.amount;
      const paid = due < now;
      await db.financialEntry.create({
        data: {
          type: "PAGAR",
          description: `${e.description} — ${month.split("-").reverse().join("/")}`,
          amount,
          netAmount: amount,
          dueDate: due,
          status: paid ? "PAGA" : "ABERTA",
          paidAt: paid ? due : null,
          categoryId: cats[e.key],
          accountId: bancoId,
          method: "BOLETO",
          originType: "MANUAL",
          recurrence: "MENSAL",
          recurrenceGroup: `seed-${e.key}`,
          createdById: adminId,
          createdAt: start,
        },
      });
      count++;
    }
    // impostos (Simples Nacional ~6% do faturamento do mês anterior)
    const prev = monthRange(shiftMonth(month, -1));
    const revenue = await db.sale.aggregate({ where: { status: "CONCLUIDA", completedAt: { gte: prev.start, lt: prev.end } }, _sum: { total: true } });
    const tax = Math.round((revenue._sum.total ?? 0) * 0.06);
    if (tax > 0) {
      const due = new Date(start);
      due.setDate(20);
      due.setHours(12);
      const paid = due < now;
      await db.financialEntry.create({
        data: {
          type: "PAGAR",
          description: `DAS Simples Nacional — competência ${shiftMonth(month, -1).split("-").reverse().join("/")}`,
          amount: tax,
          netAmount: tax,
          dueDate: due,
          status: paid ? "PAGA" : "ABERTA",
          paidAt: paid ? due : null,
          categoryId: cats.IMPOSTOS,
          accountId: bancoId,
          method: "BOLETO",
          originType: "MANUAL",
          createdById: adminId,
          createdAt: start,
        },
      });
      count++;
    }
    void end;
  }

  // comissões dos meses anteriores pagas no dia 5 do mês seguinte
  for (let i = -7; i <= -1; i++) {
    const month = shiftMonth(thisMonth, i);
    const rows = await commissionsForMonth(month);
    const payDay = monthRange(shiftMonth(month, 1)).start;
    payDay.setDate(5);
    payDay.setHours(12);
    for (const r of rows.filter((x) => x.pending > 0)) {
      await db.financialEntry.create({
        data: {
          type: "PAGAR",
          description: `Comissão ${month.split("-").reverse().join("/")} — ${r.seller}`,
          amount: r.pending,
          netAmount: r.pending,
          dueDate: payDay,
          status: "PAGA",
          paidAt: payDay,
          categoryId: cats.COMISSAO,
          accountId: bancoId,
          method: "PIX",
          originType: "COMISSAO",
          originId: `${r.sellerId}|${month}`,
          createdById: adminId,
          createdAt: payDay,
        },
      });
      count++;
    }
  }
  return count;
}
