import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { SuppliersTable } from "./suppliers-table";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function SuppliersPage() {
  await requirePage("suppliers.view");
  const [suppliers, purchases] = await Promise.all([
    db.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    db.purchaseOrder.groupBy({ by: ["supplierId"], where: { deletedAt: null, status: { not: "CANCELADO" } }, _sum: { total: true }, _count: true, _max: { createdAt: true } }),
  ]);
  const map = new Map(purchases.map((p) => [p.supplierId, p]));
  return (
    <div>
      <PageHeader title="Fornecedores" description="Distribuidores, atacadistas e pessoas físicas de quem a loja compra." />
      <SuppliersTable
        rows={suppliers.map((s) => ({
          id: s.id,
          kind: s.kind as "PJ" | "PF",
          name: s.name,
          document: s.document ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          contact: s.contact ?? "",
          cep: s.cep ?? "",
          street: s.street ?? "",
          number: s.number ?? "",
          district: s.district ?? "",
          city: s.city ?? "",
          state: s.state ?? "",
          notes: s.notes ?? "",
          purchases: map.get(s.id)?._count ?? 0,
          total: map.get(s.id)?._sum.total ?? 0,
          lastPurchase: map.get(s.id)?._max.createdAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
