// Leitura das configurações usadas pela venda (taxas, avaliação, comissão, garantia).
import type { Tx } from "@/lib/db";
import { parseJson } from "@/lib/db";
import type { CardFeeRule } from "@/domain/installments";
import { DEFAULT_TRADE_IN_ADJUSTMENTS, type TradeInAdjustments } from "@/domain/trade-in";
import type { CommissionCategory } from "@/domain/sale";

export async function getCardRules(tx: Tx, accountId?: string | null): Promise<(CardFeeRule & { accountId: string })[]> {
  const where = accountId ? { accountId } : { account: { kind: "MAQUININHA", active: true, deletedAt: null } };
  const fees = await tx.cardFee.findMany({ where, orderBy: [{ accountId: "asc" }, { method: "asc" }, { installments: "asc" }] });
  // uma maquininha por vez: usa a primeira encontrada quando não especificada
  const first = fees[0]?.accountId;
  return fees
    .filter((f) => f.accountId === (accountId ?? first) && (f.brand === "TODAS" || !f.brand))
    .map((f) => ({
      accountId: f.accountId,
      method: f.method as "DEBITO" | "CREDITO",
      installments: f.installments,
      feePct: f.feePct,
      customerRatePct: f.customerRatePct,
      settlementDays: f.settlementDays,
    }));
}

export async function getTradeInAdjustments(tx: Tx): Promise<TradeInAdjustments> {
  const row = await tx.tradeInAdjustments.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_TRADE_IN_ADJUSTMENTS;
  return {
    battery: parseJson(row.battery, DEFAULT_TRADE_IN_ADJUSTMENTS.battery),
    grade: parseJson(row.grade, DEFAULT_TRADE_IN_ADJUSTMENTS.grade),
    checklist: parseJson(row.checklist, DEFAULT_TRADE_IN_ADJUSTMENTS.checklist),
  };
}

export async function getCommissionRates(tx: Tx, userId: string) {
  const [user, rules] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId } }),
    tx.commissionRule.findMany({ where: { OR: [{ userId }, { userId: null }] } }),
  ]);
  const rates: Partial<Record<CommissionCategory, number>> = {};
  // regra global primeiro, a do vendedor sobrescreve
  for (const r of rules.filter((r) => !r.userId)) rates[r.category as CommissionCategory] = r.pct;
  for (const r of rules.filter((r) => r.userId)) rates[r.category as CommissionCategory] = r.pct;
  return { rates, fallbackPct: user.commissionPct };
}

export async function getWarrantyDays(tx: Tx): Promise<Record<string, { days: number; clauses: string | null }>> {
  const rules = await tx.warrantyRule.findMany();
  const map: Record<string, { days: number; clauses: string | null }> = {
    NOVO: { days: 365, clauses: null },
    SEMINOVO: { days: 90, clauses: null },
    VITRINE: { days: 180, clauses: null },
    RECONDICIONADO: { days: 90, clauses: null },
    ACESSORIO: { days: 90, clauses: null },
    SERVICO: { days: 90, clauses: null },
  };
  for (const r of rules) map[r.condition] = { days: r.days, clauses: r.clauses };
  return map;
}
