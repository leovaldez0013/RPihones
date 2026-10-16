// Cálculos de venda: totais, desconto, comissão e garantia.
import { pct, sum } from "./money";

export type SaleLine = {
  kind: "DEVICE" | "ACCESSORY" | "SERVICE";
  quantity: number;
  unitPrice: number;
  discount: number; // desconto total da linha (centavos)
  unitCost: number;
  condition?: string | null; // aparelho: NOVO/SEMINOVO… (comissão e garantia)
};

export type SaleTotals = {
  subtotal: number;
  itemDiscount: number;
  discount: number;
  total: number;
  cost: number;
  discountPct: number;
};

export function lineGross(l: SaleLine) {
  return l.unitPrice * l.quantity;
}

export function lineNet(l: SaleLine) {
  return lineGross(l) - l.discount;
}

export function saleTotals(lines: SaleLine[], discount: number): SaleTotals {
  const subtotal = sum(lines.map(lineGross));
  const itemDiscount = sum(lines.map((l) => l.discount));
  const total = subtotal - itemDiscount - discount;
  return {
    subtotal,
    itemDiscount,
    discount,
    total,
    cost: sum(lines.map((l) => l.unitCost * l.quantity)),
    discountPct: subtotal ? ((itemDiscount + discount) / subtotal) * 100 : 0,
  };
}

/** Rateia o desconto geral entre as linhas proporcionalmente ao valor líquido de cada uma. */
export function allocateDiscount(lines: SaleLine[], discount: number): number[] {
  const nets = lines.map(lineNet);
  const base = sum(nets);
  if (!base || !discount) return lines.map(() => 0);
  const shares = nets.map((n) => Math.floor((n * discount) / base));
  let rest = discount - sum(shares);
  for (let i = 0; rest > 0 && i < shares.length; i++, rest--) shares[i]++;
  return shares;
}

export type CommissionCategory = "APARELHO_NOVO" | "APARELHO_SEMINOVO" | "ACESSORIO" | "SERVICO";

export function commissionCategory(l: SaleLine): CommissionCategory {
  if (l.kind === "ACCESSORY") return "ACESSORIO";
  if (l.kind === "SERVICE") return "SERVICO";
  return l.condition === "NOVO" ? "APARELHO_NOVO" : "APARELHO_SEMINOVO";
}

/**
 * Comissão = Σ (valor líquido da linha após desconto rateado × % da categoria).
 * `rates` vem das regras do vendedor (ou globais) com fallback para o % padrão do vendedor.
 */
export function calcCommission(lines: SaleLine[], discount: number, rates: Partial<Record<CommissionCategory, number>>, fallbackPct: number): number {
  const shares = allocateDiscount(lines, discount);
  return sum(lines.map((l, i) => pct(lineNet(l) - shares[i], rates[commissionCategory(l)] ?? fallbackPct)));
}

export function warrantyUntil(start: Date, days: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d;
}
