import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PurchasesTable } from "./purchases-table";

export const metadata: Metadata = { title: "Compras" };

export default async function PurchasesPage() {
  const user = await requirePage("purchases.view");
  const purchases = await db.purchaseOrder.findMany({
    where: { deletedAt: null },
    include: { supplier: true, items: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader
        title="Compras"
        description="Pedidos a fornecedores com entrada automática no estoque e contas a pagar."
        actions={
          can(user.role, "purchases.edit") && (
            <>
              <Button asChild variant="outline" size="lg">
                <Link href="/compras/usado">
                  <UserRound /> Comprar de pessoa física
                </Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/compras/nova">
                  <Plus /> Novo pedido
                </Link>
              </Button>
            </>
          )
        }
      />
      <PurchasesTable
        rows={purchases.map((p) => {
          const qty = p.items.reduce((a, i) => a + i.quantity, 0);
          const rec = p.items.reduce((a, i) => a + i.receivedQty, 0);
          return {
            id: p.id,
            number: p.number,
            supplier: p.supplier.name,
            status: p.status,
            items: qty,
            received: rec,
            total: p.total,
            createdAt: p.createdAt.toISOString(),
            expectedAt: p.expectedAt?.toISOString() ?? null,
          };
        })}
      />
    </div>
  );
}
