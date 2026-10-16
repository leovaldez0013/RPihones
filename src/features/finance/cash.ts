// Caixa por turno: abertura, sangria/suprimento e fechamento com conferência.
import type { Tx } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { formatBRL } from "@/domain/money";
import { createEntry, defaultAccountId } from "./service";

/** Valores apurados na sessão, por forma de pagamento (entradas e saídas ligadas ao caixa/turno). */
export async function sessionTotals(tx: Tx, sessionId: string) {
  const s = await tx.cashSession.findUniqueOrThrow({ where: { id: sessionId }, include: { movements: true } });
  const until = s.closedAt ?? new Date();
  // tudo o que a pessoa recebeu no turno (para conferência de cartão/PIX), e o dinheiro ligado à sessão
  const entries = await tx.financialEntry.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELADA" },
      createdById: s.userId,
      createdAt: { gte: s.openedAt, lte: until },
      originType: { in: ["VENDA", "OS", "ENCOMENDA"] },
    },
  });
  const byMethod: Record<string, number> = {};
  for (const e of entries) {
    if (e.type !== "RECEBER" || !e.method) continue;
    // parcelado vira várias parcelas: soma o bruto de todas
    byMethod[e.method] = (byMethod[e.method] ?? 0) + e.amount;
  }
  const cashIn = (
    await tx.financialEntry.findMany({ where: { cashSessionId: sessionId, status: "PAGA", deletedAt: null, method: "DINHEIRO", originType: { not: "CAIXA" } } })
  ).reduce((a, e) => a + (e.type === "RECEBER" ? e.netAmount : -e.netAmount), 0);
  const suprimentos = s.movements.filter((m) => m.type === "SUPRIMENTO").reduce((a, m) => a + m.amount, 0);
  const sangrias = s.movements.filter((m) => m.type === "SANGRIA").reduce((a, m) => a + m.amount, 0);
  const expectedCash = s.openingAmount + cashIn + suprimentos - sangrias;
  return { session: s, byMethod, cashIn, suprimentos, sangrias, expectedCash };
}

export async function openCash(tx: Tx, accountId: string, openingAmount: number, userId: string) {
  const open = await tx.cashSession.findFirst({ where: { userId, closedAt: null } });
  if (open) throw new BusinessError("Você já tem um caixa aberto. Feche-o antes de abrir outro.");
  const s = await tx.cashSession.create({ data: { userId, accountId, openingAmount } });
  await audit(tx, { userId, action: "cash.open", entity: "CashSession", entityId: s.id, summary: `Caixa aberto com ${formatBRL(openingAmount)}` });
  return s;
}

export async function cashMovement(tx: Tx, input: { sessionId: string; type: "SANGRIA" | "SUPRIMENTO"; amount: number; reason: string }, userId: string) {
  const s = await tx.cashSession.findUniqueOrThrow({ where: { id: input.sessionId } });
  if (s.closedAt) throw new BusinessError("Caixa já fechado.");
  if (input.type === "SANGRIA") {
    const { expectedCash } = await sessionTotals(tx, s.id);
    if (input.amount > expectedCash) throw new BusinessError(`Sangria maior que o dinheiro em caixa (${formatBRL(expectedCash)}).`);
  }
  await tx.cashMovement.create({ data: { sessionId: s.id, type: input.type, amount: input.amount, reason: input.reason, createdById: userId } });
  const bank = await defaultAccountId(tx, "BANCO");
  const now = new Date();
  // sangria: sai do caixa e entra no banco (transferência); suprimento: o inverso
  const from = input.type === "SANGRIA" ? s.accountId : bank;
  const to = input.type === "SANGRIA" ? bank : s.accountId;
  const common = { amount: input.amount, dueDate: now, paid: true, paidAt: now, method: "DINHEIRO", originType: "CAIXA", originId: s.id, notes: input.reason, userId };
  await createEntry(tx, { ...common, type: "PAGAR", description: `${input.type === "SANGRIA" ? "Sangria" : "Suprimento"} — ${input.reason}`, accountId: from, categoryKey: "SANGRIA", cashSessionId: input.type === "SANGRIA" ? s.id : null });
  await createEntry(tx, { ...common, type: "RECEBER", description: `${input.type === "SANGRIA" ? "Sangria" : "Suprimento"} — ${input.reason}`, accountId: to, categoryKey: "SUPRIMENTO", cashSessionId: input.type === "SUPRIMENTO" ? s.id : null });
  await audit(tx, { userId, action: `cash.${input.type.toLowerCase()}`, entity: "CashSession", entityId: s.id, summary: `${input.type === "SANGRIA" ? "Sangria" : "Suprimento"} de ${formatBRL(input.amount)}: ${input.reason}` });
}

export async function closeCash(tx: Tx, sessionId: string, counted: number, notes: string | null, userId: string) {
  const t = await sessionTotals(tx, sessionId);
  if (t.session.closedAt) throw new BusinessError("Caixa já fechado.");
  const difference = counted - t.expectedCash;
  await tx.cashSession.update({
    where: { id: sessionId },
    data: {
      closedAt: new Date(),
      closingCounted: JSON.stringify({ DINHEIRO: counted }),
      closingExpected: JSON.stringify({ DINHEIRO: t.expectedCash, ...t.byMethod }),
      difference,
      notes,
    },
  });
  await audit(tx, {
    userId,
    action: "cash.close",
    entity: "CashSession",
    entityId: sessionId,
    summary: `Caixa fechado: apurado ${formatBRL(t.expectedCash)}, contado ${formatBRL(counted)}, diferença ${formatBRL(difference)}`,
  });
  return { ...t, difference };
}
