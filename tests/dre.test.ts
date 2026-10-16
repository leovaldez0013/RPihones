import { describe, expect, it } from "vitest";
import { computeDre, entryDisplayStatus } from "@/domain/dre";

describe("DRE", () => {
  it("calcula receita, CMV, taxas, comissões, despesas e lucro", () => {
    const dre = computeDre({
      sales: [
        { subtotal: 500000, discounts: 10000, interest: 20000, cost: 380000, cardFees: 15000, commission: 9800 },
        { subtotal: 100000, discounts: 0, interest: 0, cost: 60000, cardFees: 0, commission: 2000 },
      ],
      services: [{ price: 30000, cost: 9000 }],
      expenses: [
        { group: "DESPESA_OPERACIONAL", category: "Aluguel", amount: 50000, kind: "DESPESA" },
        { group: "DESPESA_OPERACIONAL", category: "Marketing", amount: 10000, kind: "DESPESA" },
        { group: "OUTRAS", category: "Outras receitas", amount: 5000, kind: "RECEITA" },
      ],
    });
    expect(dre.grossRevenue).toBe(630000);
    expect(dre.netRevenue).toBe(620000);
    expect(dre.grossProfit).toBe(620000 - 449000);
    // 171000 - 15000 - 11800 - 60000 = 84200 ; + juros 20000 + outras 5000
    expect(dre.netProfit).toBe(109200);
    const opex = dre.lines.find((l) => l.key === "opex")!;
    expect(opex.children?.[0]).toEqual({ label: "Aluguel", value: -50000 });
  });

  it("marca conta aberta vencida", () => {
    const today = new Date("2026-05-10T15:00:00");
    expect(entryDisplayStatus({ status: "ABERTA", dueDate: "2026-05-09T12:00:00" }, today)).toBe("VENCIDA");
    expect(entryDisplayStatus({ status: "ABERTA", dueDate: "2026-05-10T08:00:00" }, today)).toBe("ABERTA");
    expect(entryDisplayStatus({ status: "PAGA", dueDate: "2026-01-01" }, today)).toBe("PAGA");
  });
});
