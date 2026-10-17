import { describe, expect, it } from "vitest";
import { abcCurve, marginPct } from "@/domain/reports";
import { parsePeriod } from "@/features/reports/period";
import { pctDelta } from "@/features/dashboard/queries";
import { formatCell, sheetValue } from "@/lib/report-format";

describe("relatórios", () => {
  it("curva ABC: 80% / 15% / 5% pelo acumulado anterior", () => {
    const r = abcCurve([
      { name: "c", value: 5 },
      { name: "a", value: 70 },
      { name: "b", value: 15 },
      { name: "d", value: 10 },
    ]);
    expect(r.map((x) => [x.name, x.klass])).toEqual([
      ["a", "A"],
      ["b", "A"], // acumulado antes = 70% → ainda A
      ["d", "B"], // 85%
      ["c", "C"], // 95%
    ]);
    expect(r.at(-1)!.cumulative).toBeCloseTo(100);
    expect(abcCurve([])).toEqual([]);
  });

  it("margem e variação percentual", () => {
    expect(marginPct(10000, 7500)).toBe(25);
    expect(marginPct(0, 100)).toBe(0);
    expect(pctDelta(120, 100)).toBeCloseTo(20);
    expect(pctDelta(50, 0)).toBeNull();
  });

  it("período: fim inclusivo em São Paulo e datas invertidas", () => {
    const p = parsePeriod("2026-10-01", "2026-10-16");
    expect(p.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-17T03:00:00.000Z");
    const inv = parsePeriod("2026-10-16", "2026-10-01");
    expect(inv.fromStr).toBe("2026-10-01");
    expect(parsePeriod("lixo", null).fromStr).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("formatação de células para tela e planilha", () => {
    expect(formatCell(123456, "money").replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatCell(12.345, "pct")).toBe("12,3%");
    expect(formatCell(null, "money")).toBe("—");
    expect(formatCell(30, "days")).toBe("30 dias");
    expect(sheetValue(123456, "money")).toBe(1234.56);
  });
});
