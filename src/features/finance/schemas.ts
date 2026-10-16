import { z } from "zod";
import { optionalString, zCents, zDate } from "@/lib/validators";
import { ACCOUNT_KIND } from "@/domain/constants";

export const entrySchema = z.object({
  id: z.string().optional(),
  type: z.enum(["RECEBER", "PAGAR"]),
  description: z.string().trim().min(3, "Descreva o lançamento"),
  amount: zCents.refine((v) => v > 0, "Informe o valor"),
  dueDate: zDate.refine((d) => !!d, "Informe o vencimento"),
  categoryId: z.string().min(1, "Escolha a categoria"),
  accountId: optionalString,
  method: optionalString,
  supplierId: optionalString,
  customerId: optionalString,
  notes: optionalString,
  attachments: z.array(z.string()).default([]),
  recurrence: z.enum(["NENHUMA", "MENSAL", "SEMANAL"]).default("NENHUMA"),
  repeat: z.coerce.number().int().min(1).max(36).default(1),
  paid: z.boolean().default(false),
  paidAt: zDate,
});
export type EntryInput = z.input<typeof entrySchema>;

export const settleSchema = z.object({
  id: z.string(),
  paidAt: zDate.refine((d) => !!d, "Informe a data"),
  accountId: z.string().min(1, "Escolha a conta"),
  netAmount: zCents.refine((v) => v > 0, "Informe o valor"),
  method: optionalString,
});

export const accountSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2),
  kind: z.enum(ACCOUNT_KIND.values),
  initialBalance: z.coerce.number().int(),
  active: z.boolean().default(true),
});

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2),
  kind: z.enum(["RECEITA", "DESPESA"]),
  dreGroup: z.enum(["RECEITA_VENDAS", "RECEITA_SERVICOS", "DESPESA_OPERACIONAL", "OUTRAS", "ESTOQUE", "TRANSFERENCIA"]),
});

export const cardFeesSchema = z.object({
  accountId: z.string(),
  fees: z.array(
    z.object({
      method: z.enum(["DEBITO", "CREDITO"]),
      installments: z.number().int().min(1).max(18),
      feePct: z.number().min(0).max(30),
      customerRatePct: z.number().min(0).max(60),
      settlementDays: z.number().int().min(0).max(60),
    }),
  ),
});

export const openCashSchema = z.object({ accountId: z.string(), openingAmount: zCents });
export const cashMovementSchema = z.object({
  sessionId: z.string(),
  type: z.enum(["SANGRIA", "SUPRIMENTO"]),
  amount: zCents.refine((v) => v > 0, "Informe o valor"),
  reason: z.string().trim().min(3, "Informe o motivo"),
});
export const closeCashSchema = z.object({ sessionId: z.string(), counted: zCents, notes: optionalString });

export const commissionPaySchema = z.object({ sellerId: z.string(), month: z.string().regex(/^\d{4}-\d{2}$/), accountId: z.string() });

export const commissionRulesSchema = z.object({
  rules: z.array(z.object({ userId: z.string().nullable(), category: z.enum(["APARELHO_NOVO", "APARELHO_SEMINOVO", "ACESSORIO", "SERVICO"]), pct: z.number().min(0).max(100).nullable() })),
});

export const warrantyRulesSchema = z.object({
  rules: z.array(z.object({ condition: z.string(), days: z.coerce.number().int().min(0).max(1095), clauses: optionalString })),
});
