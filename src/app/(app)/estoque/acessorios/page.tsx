import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db, parseJson } from "@/lib/db";
import { getCatalog } from "@/features/devices/queries";
import { AccessoriesTable } from "./accessories-table";

export const metadata: Metadata = { title: "Acessórios" };

export default async function AccessoriesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePage("accessories.view");
  const { q } = await searchParams;
  const showCost = can(user.role, "devices.viewCost");
  const [items, catalog] = await Promise.all([
    db.accessory.findMany({ where: { deletedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    getCatalog(),
  ]);
  return (
    <div>
      <PageHeader title="Acessórios e peças" description="Controle por quantidade, SKU e código de barras." />
      <AccessoriesTable
        initialSearch={q}
        showCost={showCost}
        canEdit={can(user.role, "accessories.edit")}
        canMove={can(user.role, "accessories.move")}
        models={catalog.map((m) => m.name)}
        rows={items.map((a) => ({
          id: a.id,
          sku: a.sku,
          barcode: a.barcode ?? "",
          name: a.name,
          category: a.category,
          brand: a.brand ?? "",
          compatibility: parseJson<string[]>(a.compatibility, []),
          quantity: a.quantity,
          minStock: a.minStock,
          price: a.price,
          isPart: a.isPart,
          ...(showCost ? { cost: a.cost } : {}),
        }))}
      />
    </div>
  );
}
