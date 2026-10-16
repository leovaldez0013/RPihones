// Lançamentos financeiros. Toda movimentação tem origem rastreável (originType + originId).
import type { Tx } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { DEFAULT_CATEGORIES } from "./categories";

export async function categoryId(tx: Tx, key: string): Promise<string> {
  const found = await tx.category.findUnique({ where: { key } });
  if (found) return found.id;
  const def = DEFAULT_CATEGORIES.find((c) => c.key === key);
  if (!def) throw new BusinessError(`Categoria do sistema não encontrada: ${key}`);
  const created = await tx.category.create({ data: { ...def, system: true } });
  return created.id;
}

/** Conta padrão por tipo (primeira ativa). */
export async function defaultAccountId(tx: Tx, kind: "CAIXA" | "BANCO" | "MAQUININHA"): Promise<string | null> {
  const acc = await tx.financialAccount.findFirst({ where: { kind, active: true, deletedAt: null }, orderBy: { createdAt: "asc" } });
  return acc?.id ?? null;
}

export type EntryInput = {
  type: "RECEBER" | "PAGAR";
  description: string;
  amount: number;
  netAmount?: number;
  dueDate: Date;
  paid?: boolean;
  paidAt?: Date;
  categoryKey?: string;
  categoryId?: string;
  accountId?: string | null;
  method?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  originType: string;
  originId?: string | null;
  installment?: number;
  installments?: number;
  cashSessionId?: string | null;
  notes?: string;
  userId?: string | null;
};

export async function createEntry(tx: Tx, e: EntryInput) {
  if (e.amount < 0) throw new BusinessError("Valor do lançamento não pode ser negativo.");
  const catId = e.categoryId ?? (e.categoryKey ? await categoryId(tx, e.categoryKey) : null);
  return tx.financialEntry.create({
    data: {
      type: e.type,
      description: e.description,
      amount: e.amount,
      netAmount: e.netAmount ?? e.amount,
      dueDate: e.dueDate,
      status: e.paid ? "PAGA" : "ABERTA",
      paidAt: e.paid ? (e.paidAt ?? new Date()) : null,
      categoryId: catId,
      accountId: e.accountId ?? null,
      method: e.method ?? null,
      customerId: e.customerId ?? null,
      supplierId: e.supplierId ?? null,
      originType: e.originType,
      originId: e.originId ?? null,
      installment: e.installment,
      installments: e.installments,
      cashSessionId: e.cashSessionId ?? null,
      notes: e.notes,
      createdById: e.userId ?? null,
    },
  });
}

/**
 * Estorna todos os lançamentos de uma origem: abertos são cancelados; pagos geram
 * lançamento inverso (ESTORNO) já liquidado na mesma conta.
 */
export async function reverseEntries(
  tx: Tx,
  originType: string,
  originId: string,
  opts: { reason: string; userId?: string | null; date?: Date },
) {
  const entries = await tx.financialEntry.findMany({
    where: { originType, originId, deletedAt: null, status: { not: "CANCELADA" } },
  });
  const now = opts.date ?? new Date();
  let refunded = 0;
  for (const e of entries) {
    if (e.status === "ABERTA") {
      await tx.financialEntry.update({ where: { id: e.id }, data: { status: "CANCELADA", notes: `${e.notes ? `${e.notes}\n` : ""}Cancelado: ${opts.reason}` } });
    } else {
      await createEntry(tx, {
        type: e.type === "RECEBER" ? "PAGAR" : "RECEBER",
        description: `Estorno — ${e.description}`,
        amount: e.amount,
        netAmount: e.netAmount,
        dueDate: now,
        paid: true,
        paidAt: now,
        categoryKey: e.type === "RECEBER" ? "ESTORNO" : "OUTRAS_RECEITAS",
        accountId: e.accountId,
        method: e.method,
        customerId: e.customerId,
        supplierId: e.supplierId,
        originType: "ESTORNO",
        originId: e.id,
        notes: opts.reason,
        userId: opts.userId,
      });
      refunded += e.netAmount;
    }
  }
  return { count: entries.length, refunded };
}
