import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { SalesTable } from "./sales-table";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage() {
  const user = await requirePage("sales.view");
  const all = can(user.role, "sales.viewAll");
  const showMargin = can(user.role, "devices.viewCost");
  const sales = await db.sale.findMany({
    where: { deletedAt: null, ...(all ? {} : { sellerId: user.id }) },
    include: { customer: true, seller: true, payments: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return (
    <div>
      <PageHeader
        title="Vendas"
        description={all ? "Todas as vendas e orçamentos da loja." : "Suas vendas e orçamentos."}
        actions={
          <Button asChild size="lg">
            <Link href="/vendas/nova">
              <ShoppingCart /> Nova venda
            </Link>
          </Button>
        }
      />
      <SalesTable
        showMargin={showMargin}
        showSeller={all}
        rows={sales.map((s) => ({
          id: s.id,
          number: s.number,
          status: s.status,
          date: (s.completedAt ?? s.createdAt).toISOString(),
          customer: s.customer?.name ?? "Consumidor",
          seller: s.seller.name,
          items: s.items.reduce((a, i) => a + i.quantity, 0),
          description: s.items.map((i) => i.description.split(" — ")[0]).join(", "),
          methods: [...new Set(s.payments.map((p) => p.method))],
          total: s.total,
          ...(showMargin ? { margin: s.total - s.cost - s.cardFees - s.commission } : {}),
        }))}
      />
    </div>
  );
}
