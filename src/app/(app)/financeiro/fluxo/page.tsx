import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { cashFlow } from "@/features/finance/queries";
import { CashFlowView } from "./cash-flow-view";

export const metadata: Metadata = { title: "Fluxo de caixa" };

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  await requirePage("finance.view");
  const { visao } = await searchParams;
  const monthly = visao === "mensal";
  const now = new Date();
  const from = monthly ? new Date(now.getFullYear(), now.getMonth() - 5, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 15);
  const to = monthly ? new Date(now.getFullYear(), now.getMonth() + 3, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 31);
  const data = await cashFlow(from, to, monthly ? "month" : "day");
  return (
    <div>
      <PageHeader title="Fluxo de caixa" description="Realizado (pago/recebido) e previsto (em aberto). Valores líquidos de taxas; transferências entre contas ficam de fora." />
      <CashFlowView monthly={monthly} opening={data.opening} rows={data.rows} />
    </div>
  );
}
