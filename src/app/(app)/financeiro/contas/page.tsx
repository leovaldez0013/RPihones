import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { accountBalances } from "@/features/finance/queries";
import { AccountsManager } from "./accounts-manager";

export const metadata: Metadata = { title: "Contas, taxas e categorias" };

export default async function AccountsPage() {
  await requirePage("finance.view");
  const [balances, fees, categories] = await Promise.all([
    accountBalances(),
    db.cardFee.findMany({ orderBy: [{ method: "asc" }, { installments: "asc" }] }),
    db.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <div>
      <PageHeader title="Contas, taxas e categorias" description="Caixa, bancos e maquininhas com taxa por parcela e prazo de recebimento; plano de contas para a DRE." />
      <AccountsManager
        accounts={balances}
        fees={fees.map((f) => ({ accountId: f.accountId, method: f.method as "DEBITO" | "CREDITO", installments: f.installments, feePct: f.feePct, customerRatePct: f.customerRatePct, settlementDays: f.settlementDays }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind as "RECEITA" | "DESPESA", dreGroup: c.dreGroup, system: c.system }))}
      />
    </div>
  );
}
