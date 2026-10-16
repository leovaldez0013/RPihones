import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { commissionsForMonth, currentMonth } from "@/features/finance/queries";
import { CommissionsView } from "./commissions-view";

export const metadata: Metadata = { title: "Comissões" };

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requirePage("finance.view");
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonth();
  const [rows, accounts] = await Promise.all([
    commissionsForMonth(month),
    db.financialAccount.findMany({ where: { active: true, deletedAt: null, kind: { in: ["BANCO", "CAIXA"] } }, select: { id: true, name: true } }),
  ]);
  return (
    <div>
      <PageHeader title="Comissões" description="Calculadas por venda conforme as regras de comissão (por vendedor e categoria). Devoluções zeram a comissão." />
      <CommissionsView month={month} rows={rows} accounts={accounts} />
    </div>
  );
}
