// Cálculos puros dos relatórios.

/** Curva ABC: ordena por valor e classifica — A até 80% acumulado, B até 95%, C o restante. */
export function abcCurve<T extends { value: number }>(items: T[]): (T & { share: number; cumulative: number; klass: "A" | "B" | "C" })[] {
  const total = items.reduce((a, i) => a + i.value, 0);
  let acc = 0;
  return [...items]
    .sort((a, b) => b.value - a.value)
    .map((i) => {
      const share = total ? (i.value / total) * 100 : 0;
      // a classe usa o acumulado ANTES do item: o item que cruza 80% ainda é A
      const klass: "A" | "B" | "C" = acc < 80 ? "A" : acc < 95 ? "B" : "C";
      acc += share;
      return { ...i, share, cumulative: acc, klass };
    });
}

export function marginPct(revenue: number, cost: number) {
  return revenue ? ((revenue - cost) / revenue) * 100 : 0;
}

export type ColumnFormat = "text" | "money" | "int" | "pct" | "date" | "days";
export type ReportColumn = { key: string; label: string; format: ColumnFormat };
export type ReportRow = Record<string, string | number | null>;
export type Report = {
  key: string;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: { label: string; value: string | number; format: ColumnFormat }[];
};
