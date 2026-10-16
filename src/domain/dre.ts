// DRE simplificada (regime de competência).
// Receita e CMV vêm das vendas concluídas no período (custo real do aparelho, incluindo OS);
// taxas de cartão e comissões vêm das próprias vendas; despesas vêm dos lançamentos por categoria.
import { sum } from "./money";

export type DreSale = { subtotal: number; discounts: number; interest: number; cost: number; cardFees: number; commission: number };
export type DreService = { price: number; cost: number };
export type DreExpense = { group: string; category: string; amount: number; kind: "RECEITA" | "DESPESA" };

export type DreLine = { key: string; label: string; value: number; level: 0 | 1 | 2; strong?: boolean; children?: { label: string; value: number }[] };

export type Dre = {
  lines: DreLine[];
  grossRevenue: number;
  netRevenue: number;
  grossProfit: number;
  netProfit: number;
  netMarginPct: number;
};

export function computeDre(input: { sales: DreSale[]; services: DreService[]; expenses: DreExpense[] }): Dre {
  const salesGross = sum(input.sales.map((s) => s.subtotal));
  const servicesGross = sum(input.services.map((s) => s.price));
  const grossRevenue = salesGross + servicesGross;
  const discounts = sum(input.sales.map((s) => s.discounts));
  const netRevenue = grossRevenue - discounts;
  const cmv = sum(input.sales.map((s) => s.cost)) + sum(input.services.map((s) => s.cost));
  const grossProfit = netRevenue - cmv;
  const fees = sum(input.sales.map((s) => s.cardFees));
  const commissions = sum(input.sales.map((s) => s.commission));
  const interest = sum(input.sales.map((s) => s.interest));

  const opex = input.expenses.filter((e) => e.group === "DESPESA_OPERACIONAL");
  const byCat = new Map<string, number>();
  for (const e of opex) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  const opexTotal = sum(opex.map((e) => e.amount));

  const others = input.expenses.filter((e) => e.group === "OUTRAS");
  const othersNet = sum(others.map((e) => (e.kind === "RECEITA" ? e.amount : -e.amount)));

  const operatingProfit = grossProfit - fees - commissions - opexTotal;
  const netProfit = operatingProfit + interest + othersNet;

  const lines: DreLine[] = [
    { key: "gross", label: "Receita bruta", value: grossRevenue, level: 0, strong: true, children: [{ label: "Vendas de produtos", value: salesGross }, { label: "Serviços (OS)", value: servicesGross }] },
    { key: "discounts", label: "(−) Descontos concedidos", value: -discounts, level: 1 },
    { key: "net", label: "Receita líquida", value: netRevenue, level: 0, strong: true },
    { key: "cmv", label: "(−) Custo das mercadorias vendidas (CMV)", value: -cmv, level: 1 },
    { key: "grossProfit", label: "Lucro bruto", value: grossProfit, level: 0, strong: true },
    { key: "fees", label: "(−) Taxas de cartão", value: -fees, level: 1 },
    { key: "commissions", label: "(−) Comissões", value: -commissions, level: 1 },
    {
      key: "opex",
      label: "(−) Despesas operacionais",
      value: -opexTotal,
      level: 1,
      children: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: -value })),
    },
    { key: "operating", label: "Resultado operacional", value: operatingProfit, level: 0, strong: true },
    { key: "interest", label: "(+) Juros de parcelamento cobrados", value: interest, level: 1 },
    { key: "others", label: "(+/−) Outras receitas e despesas", value: othersNet, level: 1 },
    { key: "netProfit", label: "Lucro líquido", value: netProfit, level: 0, strong: true },
  ];
  return { lines, grossRevenue, netRevenue, grossProfit, netProfit, netMarginPct: netRevenue ? (netProfit / netRevenue) * 100 : 0 };
}

/** Status exibido: ABERTA vencida vira VENCIDA. */
export function entryDisplayStatus(e: { status: string; dueDate: Date | string }, today = new Date()): string {
  if (e.status !== "ABERTA") return e.status;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return new Date(e.dueDate) < start ? "VENCIDA" : "ABERTA";
}
