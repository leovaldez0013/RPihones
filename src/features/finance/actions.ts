"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { audit } from "@/lib/audit";
import { formatBRL } from "@/domain/money";
import { createEntry } from "./service";
import { cashMovement, closeCash, openCash } from "./cash";
import { commissionsForMonth } from "./queries";
import {
  accountSchema,
  cardFeesSchema,
  cashMovementSchema,
  categorySchema,
  closeCashSchema,
  commissionPaySchema,
  commissionRulesSchema,
  entrySchema,
  openCashSchema,
  settleSchema,
  warrantyRulesSchema,
} from "./schemas";

const revalidateFinance = () => revalidatePath("/financeiro", "layout");

export const saveEntryAction = action({ schema: entrySchema, permission: "finance.edit" }, async (input, { user }) => {
  await db.$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.financialEntry.findUniqueOrThrow({ where: { id: input.id } });
      if (before.status !== "ABERTA") throw new BusinessError("Só lançamentos em aberto podem ser editados.");
      if (before.originType !== "MANUAL" && before.amount !== input.amount) throw new BusinessError("O valor de lançamentos gerados por venda/compra não pode ser alterado aqui.");
      await tx.financialEntry.update({
        where: { id: input.id },
        data: {
          description: input.description,
          amount: input.amount,
          netAmount: before.originType === "MANUAL" ? input.amount : before.netAmount,
          dueDate: input.dueDate!,
          categoryId: input.categoryId,
          accountId: input.accountId,
          supplierId: input.supplierId,
          customerId: input.customerId,
          notes: input.notes,
          attachments: JSON.stringify(input.attachments),
        },
      });
      await audit(tx, { userId: user.id, action: "entry.update", entity: "FinancialEntry", entityId: input.id, summary: `Lançamento "${input.description}" editado`, before: { amount: before.amount, dueDate: before.dueDate }, after: { amount: input.amount, dueDate: input.dueDate } });
      return;
    }
    const count = input.recurrence === "NENHUMA" ? 1 : input.repeat;
    const group = count > 1 ? randomUUID() : null;
    for (let i = 0; i < count; i++) {
      const due = new Date(input.dueDate!);
      if (input.recurrence === "MENSAL") due.setMonth(due.getMonth() + i);
      if (input.recurrence === "SEMANAL") due.setDate(due.getDate() + 7 * i);
      const e = await createEntry(tx, {
        type: input.type,
        description: count > 1 ? `${input.description} (${i + 1}/${count})` : input.description,
        amount: input.amount,
        dueDate: due,
        paid: i === 0 && input.paid,
        paidAt: input.paidAt ?? new Date(),
        categoryId: input.categoryId,
        accountId: input.accountId,
        method: input.method,
        supplierId: input.supplierId,
        customerId: input.customerId,
        originType: "MANUAL",
        notes: input.notes ?? undefined,
        userId: user.id,
      });
      await tx.financialEntry.update({
        where: { id: e.id },
        data: { attachments: JSON.stringify(input.attachments), recurrence: input.recurrence === "NENHUMA" ? null : input.recurrence, recurrenceGroup: group },
      });
    }
    await audit(tx, { userId: user.id, action: "entry.create", entity: "FinancialEntry", summary: `${input.type === "PAGAR" ? "Conta a pagar" : "Conta a receber"}: ${input.description} — ${formatBRL(input.amount)}${count > 1 ? ` × ${count}` : ""}` });
  });
  revalidateFinance();
  return true;
});

export const settleEntryAction = action({ schema: settleSchema, permission: "finance.edit" }, async (input, { user }) => {
  await db.$transaction(async (tx) => {
    const e = await tx.financialEntry.findUniqueOrThrow({ where: { id: input.id } });
    if (e.status !== "ABERTA") throw new BusinessError("Lançamento já baixado ou cancelado.");
    await tx.financialEntry.update({ where: { id: e.id }, data: { status: "PAGA", paidAt: input.paidAt!, accountId: input.accountId, netAmount: input.netAmount, method: input.method ?? e.method } });
    await audit(tx, {
      userId: user.id,
      action: "entry.settle",
      entity: "FinancialEntry",
      entityId: e.id,
      summary: `Baixa de "${e.description}": ${formatBRL(input.netAmount)}${input.netAmount !== e.netAmount ? ` (previsto ${formatBRL(e.netAmount)})` : ""}`,
    });
  });
  revalidateFinance();
  return true;
});

export const cancelEntryAction = action({ schema: z.object({ id: z.string(), reason: z.string().min(3) }), permission: "finance.edit" }, async ({ id, reason }, { user }) => {
  await db.$transaction(async (tx) => {
    const e = await tx.financialEntry.findUniqueOrThrow({ where: { id } });
    if (e.status !== "ABERTA") throw new BusinessError("Só lançamentos em aberto podem ser cancelados. Para pagos, faça um estorno.");
    if (e.originType === "VENDA") throw new BusinessError("Recebimentos de venda são cancelados pela devolução/cancelamento da venda.");
    await tx.financialEntry.update({ where: { id }, data: { status: "CANCELADA", notes: `${e.notes ? `${e.notes}\n` : ""}Cancelado: ${reason}` } });
    await audit(tx, { userId: user.id, action: "entry.cancel", entity: "FinancialEntry", entityId: id, summary: `Lançamento "${e.description}" cancelado: ${reason}` });
  });
  revalidateFinance();
  return true;
});

export const saveAccountAction = action({ schema: accountSchema, permission: "finance.edit" }, async ({ id, ...data }, { user }) => {
  await db.$transaction(async (tx) => {
    const a = id ? await tx.financialAccount.update({ where: { id }, data }) : await tx.financialAccount.create({ data });
    await audit(tx, { userId: user.id, action: id ? "account.update" : "account.create", entity: "FinancialAccount", entityId: a.id, summary: `Conta ${a.name}` });
  });
  revalidateFinance();
  return true;
});

export const saveCategoryAction = action({ schema: categorySchema, permission: "finance.edit" }, async ({ id, ...data }, { user }) => {
  await db.$transaction(async (tx) => {
    if (id) {
      const c = await tx.category.findUniqueOrThrow({ where: { id } });
      if (c.system && c.dreGroup !== data.dreGroup) throw new BusinessError("O grupo da DRE de categorias do sistema não pode ser alterado.");
      await tx.category.update({ where: { id }, data });
    } else await tx.category.create({ data });
    await audit(tx, { userId: user.id, action: "category.save", entity: "Category", summary: `Categoria ${data.name}` });
  });
  revalidateFinance();
  return true;
});

export const saveCardFeesAction = action({ schema: cardFeesSchema, permission: "settings.operational" }, async ({ accountId, fees }, { user }) => {
  await db.$transaction(async (tx) => {
    for (const f of fees) {
      await tx.cardFee.upsert({
        where: { accountId_brand_method_installments: { accountId, brand: "TODAS", method: f.method, installments: f.installments } },
        create: { accountId, brand: "TODAS", ...f },
        update: f,
      });
    }
    await audit(tx, { userId: user.id, action: "settings.card_fees", entity: "CardFee", entityId: accountId, summary: `Taxas da maquininha atualizadas (${fees.length} faixas)`, after: fees });
  });
  revalidateFinance();
  return true;
});

export const openCashAction = action({ schema: openCashSchema, permission: "cash.operate" }, async (input, { user }) => {
  await db.$transaction((tx) => openCash(tx, input.accountId, input.openingAmount, user.id));
  revalidatePath("/financeiro/caixa");
  return true;
});

export const cashMovementAction = action({ schema: cashMovementSchema, permission: "cash.operate" }, async (input, { user }) => {
  await db.$transaction((tx) => cashMovement(tx, input, user.id));
  revalidatePath("/financeiro/caixa");
  return true;
});

export const closeCashAction = action({ schema: closeCashSchema, permission: "cash.operate" }, async (input, { user }) => {
  const r = await db.$transaction((tx) => closeCash(tx, input.sessionId, input.counted, input.notes ?? null, user.id));
  revalidatePath("/financeiro/caixa");
  return { expected: r.expectedCash, difference: r.difference };
});

export const payCommissionAction = action({ schema: commissionPaySchema, permission: "finance.edit" }, async ({ sellerId, month, accountId }, { user }) => {
  const rows = await commissionsForMonth(month);
  const row = rows.find((r) => r.sellerId === sellerId);
  if (!row || row.pending <= 0) throw new BusinessError("Não há comissão pendente para este vendedor no mês.");
  await db.$transaction(async (tx) => {
    const now = new Date();
    await createEntry(tx, {
      type: "PAGAR",
      description: `Comissão ${month.split("-").reverse().join("/")} — ${row.seller}`,
      amount: row.pending,
      dueDate: now,
      paid: true,
      paidAt: now,
      categoryKey: "COMISSAO",
      accountId,
      method: "PIX",
      originType: "COMISSAO",
      originId: `${sellerId}|${month}`,
      userId: user.id,
    });
    await audit(tx, { userId: user.id, action: "commission.pay", entity: "User", entityId: sellerId, summary: `Comissão de ${month} paga a ${row.seller}: ${formatBRL(row.pending)}` });
  });
  revalidateFinance();
  return true;
});

export const saveCommissionRulesAction = action({ schema: commissionRulesSchema, permission: "settings.operational" }, async ({ rules }, { user }) => {
  await db.$transaction(async (tx) => {
    for (const r of rules) {
      const existing = await tx.commissionRule.findFirst({ where: { userId: r.userId, category: r.category } });
      if (r.pct == null) {
        if (existing) await tx.commissionRule.delete({ where: { id: existing.id } });
      } else if (existing) await tx.commissionRule.update({ where: { id: existing.id }, data: { pct: r.pct } });
      else await tx.commissionRule.create({ data: { userId: r.userId, category: r.category, pct: r.pct } });
    }
    await audit(tx, { userId: user.id, action: "settings.commission", entity: "CommissionRule", summary: "Regras de comissão atualizadas", after: rules });
  });
  revalidatePath("/configuracoes/comissoes");
  return true;
});

export const saveWarrantyRulesAction = action({ schema: warrantyRulesSchema, permission: "settings.operational" }, async ({ rules }, { user }) => {
  await db.$transaction(async (tx) => {
    for (const r of rules) await tx.warrantyRule.upsert({ where: { condition: r.condition }, create: r, update: { days: r.days, clauses: r.clauses } });
    await audit(tx, { userId: user.id, action: "settings.warranty", entity: "WarrantyRule", summary: "Prazos de garantia atualizados", after: rules.map((r) => ({ condition: r.condition, days: r.days })) });
  });
  revalidatePath("/configuracoes/garantias");
  return true;
});
