import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = { title: "Encomendas" };

export default async function OrdersPage() {
  const user = await requirePage("orders.view");
  const orders = await db.order.findMany({ where: { deletedAt: null }, include: { customer: true }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader
        title="Encomendas"
        description="Pedidos de aparelhos que a loja ainda não tem. Quando entra um compatível no estoque, o sistema avisa."
        actions={
          can(user.role, "orders.edit") && (
            <Button asChild size="lg">
              <Link href="/encomendas/nova">
                <Plus /> Nova encomenda
              </Link>
            </Button>
          )
        }
      />
      <OrdersTable
        rows={orders.map((o) => ({
          id: o.id,
          number: o.number,
          customer: o.customer.name,
          phone: o.customer.phone,
          spec: [o.modelName, o.capacity, o.color].filter(Boolean).join(" "),
          deposit: o.deposit,
          maxPrice: o.maxPrice,
          status: o.status,
          hasDevice: !!o.deviceId,
          createdAt: o.createdAt.toISOString(),
          dueDate: o.dueDate?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
