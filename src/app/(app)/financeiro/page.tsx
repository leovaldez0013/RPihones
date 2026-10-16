import type { Metadata } from "next";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/domain/money";
import { entryDisplayStatus } from "@/domain/dre";
import { accountBalances } from "@/features/finance/queries";
import { EntriesTable } from "./entries-table";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ lancamento?: string }> }) {
  await requirePage("finance.view");
  const { lancamento } = await searchParams;
  const since = new Date();
  since.setMonth(since.getMonth() - 13);
  const [entries, categories, accounts, suppliers, balances] = await Promise.all([
    db.financialEntry.findMany({
      where: { deletedAt: null, OR: [{ status: "ABERTA" }, { dueDate: { gte: since } }] },
      include: { category: true, account: true, supplier: true, customer: true },
      orderBy: { dueDate: "asc" },
    }),
    db.category.findMany({ where: { deletedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.financialAccount.findMany({ where: { deletedAt: null, active: true }, orderBy: { name: "asc" } }),
    db.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    accountBalances(),
  ]);

  const today = new Date();
  const in7 = new Date(today.getTime() + 7 * 86400000);
  const open = entries.filter((e) => e.status === "ABERTA");
  const overdue = open.filter((e) => entryDisplayStatus(e, today) === "VENCIDA");
  const recv7 = open.filter((e) => e.type === "RECEBER" && e.dueDate <= in7).reduce((a, e) => a + e.netAmount, 0);
  const pay7 = open.filter((e) => e.type === "PAGAR" && e.dueDate <= in7).reduce((a, e) => a + e.netAmount, 0);
  const totalBalance = balances.reduce((a, b) => a + b.balance, 0);

  return (
    <div>
      <PageHeader title="Contas a pagar e receber" description="Toda movimentação tem origem rastreável: venda, compra, OS, encomenda ou lançamento manual." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saldo em contas" value={formatBRL(totalBalance)} icon={Landmark} hint={`${balances.length} contas`} />
        <StatCard label="A receber em 7 dias" value={formatBRL(recv7)} icon={ArrowDownLeft} tone="green" />
        <StatCard label="A pagar em 7 dias" value={formatBRL(pay7)} icon={ArrowUpRight} tone="amber" />
        <StatCard
          label="Vencidas"
          value={overdue.length}
          icon={AlertTriangle}
          tone="red"
          hint={`${formatBRL(overdue.filter((e) => e.type === "PAGAR").reduce((a, e) => a + e.netAmount, 0))} a pagar · ${formatBRL(overdue.filter((e) => e.type === "RECEBER").reduce((a, e) => a + e.netAmount, 0))} a receber`}
        />
      </div>
      <EntriesTable
        highlightId={lancamento}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, dreGroup: c.dreGroup }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }))}
        suppliers={suppliers}
        rows={entries.map((e) => ({
          id: e.id,
          type: e.type as "RECEBER" | "PAGAR",
          description: e.description,
          amount: e.amount,
          netAmount: e.netAmount,
          dueDate: e.dueDate.toISOString(),
          paidAt: e.paidAt?.toISOString() ?? null,
          status: entryDisplayStatus(e, today),
          rawStatus: e.status,
          category: e.category?.name ?? "—",
          categoryId: e.categoryId,
          account: e.account?.name ?? "—",
          accountId: e.accountId,
          method: e.method,
          party: e.supplier?.name ?? e.customer?.name ?? "",
          supplierId: e.supplierId,
          originType: e.originType,
          originId: e.originId,
          notes: e.notes ?? "",
          attachments: JSON.parse(e.attachments || "[]") as string[],
        }))}
      />
    </div>
  );
}
