// Cálculo de cartão: juros repassados ao cliente, taxa da maquininha e recebíveis.
import { pct, splitCents } from "./money";

export type CardFeeRule = {
  method: "DEBITO" | "CREDITO";
  installments: number;
  feePct: number; // taxa cobrada da loja pela maquininha (sobre o valor passado)
  customerRatePct: number; // juros totais repassados ao cliente (%) — 0 = sem juros
  settlementDays: number; // prazo de recebimento
};

export type CardCalc = {
  base: number; // valor que abate da venda
  installments: number;
  interest: number; // juros cobrados do cliente
  customerTotal: number; // valor passado na maquininha
  installmentValues: number[]; // parcelas que o cliente paga
  feePct: number;
  feeAmount: number; // taxa da maquininha
  net: number; // valor líquido que a loja recebe
};

export function findFee(rules: CardFeeRule[], method: "DEBITO" | "CREDITO", installments: number): CardFeeRule | null {
  return rules.find((r) => r.method === method && r.installments === installments) ?? null;
}

/** Calcula o pagamento no cartão para `base` centavos em `n` parcelas. */
export function calcCard(base: number, rule: Pick<CardFeeRule, "feePct" | "customerRatePct">, n = 1): CardCalc {
  const interest = pct(base, rule.customerRatePct);
  const customerTotal = base + interest;
  const feeAmount = pct(customerTotal, rule.feePct);
  return {
    base,
    installments: n,
    interest,
    customerTotal,
    installmentValues: splitCents(customerTotal, n),
    feePct: rule.feePct,
    feeAmount,
    net: customerTotal - feeAmount,
  };
}

/** Simulação 1x a 12x para mostrar ao cliente. */
export function simulateInstallments(base: number, rules: CardFeeRule[], max = 12) {
  const out: (CardCalc & { label: string; withInterest: boolean })[] = [];
  for (let n = 1; n <= max; n++) {
    const rule = findFee(rules, "CREDITO", n);
    if (!rule) continue;
    const c = calcCard(base, rule, n);
    out.push({ ...c, withInterest: c.interest > 0, label: `${n}x de ${(c.installmentValues[c.installmentValues.length - 1] / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
  }
  return out;
}

/**
 * Agenda de recebíveis da maquininha: débito/crédito à vista recebem em `settlementDays`;
 * parcelado recebe uma parcela por mês (settlementDays × i), cada uma líquida da taxa.
 */
export function receivableSchedule(calc: CardCalc, settlementDays: number, start: Date = new Date()) {
  const grossParts = calc.installmentValues;
  const netParts = splitCents(calc.net, calc.installments);
  return grossParts.map((gross, i) => {
    const days = calc.installments > 1 ? settlementDays * (i + 1) : settlementDays;
    const due = new Date(start);
    due.setDate(due.getDate() + days);
    return { installment: i + 1, gross, net: netParts[i], dueDate: due };
  });
}
