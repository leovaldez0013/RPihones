import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db, parseJson } from "@/lib/db";
import { sessionTotals } from "@/features/finance/cash";
import { CashPanel } from "./cash-panel";

export const metadata: Metadata = { title: "Caixa" };

export default async function CashPage() {
  const user = await requirePage("cash.operate");
  const seeAll = can(user.role, "finance.view");
  const [open, accounts, history] = await Promise.all([
    db.cashSession.findFirst({ where: { userId: user.id, closedAt: null } }),
    db.financialAccount.findMany({ where: { kind: "CAIXA", active: true, deletedAt: null }, select: { id: true, name: true } }),
    db.cashSession.findMany({
      where: { closedAt: { not: null }, ...(seeAll ? {} : { userId: user.id }) },
      include: { user: true },
      orderBy: { openedAt: "desc" },
      take: 30,
    }),
  ]);
  const totals = open ? await sessionTotals(db, open.id) : null;
  return (
    <div>
      <PageHeader title="Caixa" description="Abertura e fechamento por turno, com sangria, suprimento e conferência por forma de pagamento." />
      <CashPanel
        accounts={accounts}
        current={
          totals
            ? {
                id: totals.session.id,
                openedAt: totals.session.openedAt.toISOString(),
                openingAmount: totals.session.openingAmount,
                cashIn: totals.cashIn,
                suprimentos: totals.suprimentos,
                sangrias: totals.sangrias,
                expectedCash: totals.expectedCash,
                byMethod: totals.byMethod,
                movements: totals.session.movements.map((m) => ({ id: m.id, type: m.type, amount: m.amount, reason: m.reason ?? "", createdAt: m.createdAt.toISOString() })),
              }
            : null
        }
        history={history.map((h) => ({
          id: h.id,
          user: h.user.name,
          openedAt: h.openedAt.toISOString(),
          closedAt: h.closedAt!.toISOString(),
          opening: h.openingAmount,
          expected: parseJson<Record<string, number>>(h.closingExpected, {}).DINHEIRO ?? 0,
          counted: parseJson<Record<string, number>>(h.closingCounted, {}).DINHEIRO ?? 0,
          difference: h.difference ?? 0,
          notes: h.notes ?? "",
        }))}
      />
    </div>
  );
}
