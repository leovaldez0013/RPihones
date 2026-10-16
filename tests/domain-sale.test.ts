import { describe, expect, it } from "vitest";
import { calcCard, receivableSchedule, simulateInstallments, type CardFeeRule } from "@/domain/installments";
import { evaluateTradeIn } from "@/domain/trade-in";
import { allocateDiscount, calcCommission, saleTotals, type SaleLine } from "@/domain/sale";

const RULES: CardFeeRule[] = [
  { method: "DEBITO", installments: 1, feePct: 1.37, customerRatePct: 0, settlementDays: 1 },
  { method: "CREDITO", installments: 1, feePct: 3.19, customerRatePct: 0, settlementDays: 30 },
  { method: "CREDITO", installments: 3, feePct: 5.09, customerRatePct: 0, settlementDays: 30 },
  { method: "CREDITO", installments: 10, feePct: 9.99, customerRatePct: 12.1, settlementDays: 30 },
];

describe("cartão e parcelamento", () => {
  it("sem juros: cliente paga o valor, loja recebe líquido da taxa", () => {
    const c = calcCard(300000, RULES[2], 3);
    expect(c.interest).toBe(0);
    expect(c.customerTotal).toBe(300000);
    expect(c.installmentValues).toEqual([100000, 100000, 100000]);
    expect(c.feeAmount).toBe(15270);
    expect(c.net).toBe(284730);
  });

  it("com juros repassados: parcelas somam exatamente o total do cliente", () => {
    const c = calcCard(459000, RULES[3], 10);
    expect(c.interest).toBe(55539); // 12,1% de 4.590,00
    expect(c.customerTotal).toBe(514539);
    expect(c.installmentValues.reduce((a, b) => a + b, 0)).toBe(514539);
    expect(c.feeAmount).toBe(51402); // 9,99% sobre o total passado
    expect(c.net).toBe(c.customerTotal - c.feeAmount);
  });

  it("gera recebíveis mensais no parcelado e um só no débito", () => {
    const start = new Date("2026-01-10T12:00:00-03:00");
    const parc = receivableSchedule(calcCard(300000, RULES[2], 3), 30, start);
    expect(parc).toHaveLength(3);
    expect(parc.map((p) => p.dueDate.toISOString().slice(0, 10))).toEqual(["2026-02-09", "2026-03-11", "2026-04-10"]);
    expect(parc.reduce((a, p) => a + p.net, 0)).toBe(284730);
    const deb = receivableSchedule(calcCard(10000, RULES[0], 1), 1, start);
    expect(deb).toHaveLength(1);
  });

  it("simula só as parcelas configuradas", () => {
    const sim = simulateInstallments(100000, RULES);
    expect(sim.map((s) => s.installments)).toEqual([1, 3, 10]);
    expect(sim[2].withInterest).toBe(true);
  });
});

describe("avaliação de troca", () => {
  it("aplica ajustes de bateria, grade e checklist e arredonda para R$ 10", () => {
    const r = evaluateTradeIn(200000, { batteryHealth: 83, grade: "B", checklist: { tela: true, cameras: false } });
    // -10 (bateria) -8 (grade B) -15 (câmeras) = -33%
    expect(r.totalPct).toBe(-33);
    expect(r.suggested).toBe(134000);
  });
  it("bloqueia iCloud vinculado", () => {
    const r = evaluateTradeIn(200000, { checklist: { icloud: false } });
    expect(r.blocked).toBe(true);
    expect(r.suggested).toBe(0);
  });
});

describe("venda", () => {
  const lines: SaleLine[] = [
    { kind: "DEVICE", quantity: 1, unitPrice: 500000, discount: 10000, unitCost: 380000, condition: "SEMINOVO" },
    { kind: "ACCESSORY", quantity: 2, unitPrice: 5000, discount: 0, unitCost: 1200 },
  ];
  it("calcula totais e % de desconto", () => {
    const t = saleTotals(lines, 5000);
    expect(t.subtotal).toBe(510000);
    expect(t.total).toBe(495000);
    expect(t.cost).toBe(382400);
    expect(t.discountPct).toBeCloseTo(2.94, 1);
  });
  it("rateia desconto sem perder centavos", () => {
    const s = allocateDiscount(lines, 5001);
    expect(s.reduce((a, b) => a + b, 0)).toBe(5001);
  });
  it("calcula comissão por categoria", () => {
    const c = calcCommission(lines, 0, { APARELHO_SEMINOVO: 2, ACESSORIO: 10 }, 1);
    expect(c).toBe(9800 + 1000);
  });
});
