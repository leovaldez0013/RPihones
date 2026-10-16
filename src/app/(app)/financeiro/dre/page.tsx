import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { currentMonth, dreForMonth, profitBreakdown, shiftMonth } from "@/features/finance/queries";
import { DreView } from "./dre-view";

export const metadata: Metadata = { title: "DRE" };

export default async function DrePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePage("finance.view");
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonth();
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const [dres, breakdown] = await Promise.all([Promise.all(months.map((m) => dreForMonth(m))), profitBreakdown(month)]);
  return (
    <div>
      <PageHeader title="DRE simplificada" description="Regime de competência. CMV usa o custo real do aparelho (aquisição + OS internas)." />
      <DreView
        month={month}
        current={dres[5]}
        previous={dres[4]}
        series={months.map((m, i) => ({ month: m, revenue: dres[i].netRevenue, profit: dres[i].netProfit }))}
        breakdown={breakdown}
      />
    </div>
  );
}
