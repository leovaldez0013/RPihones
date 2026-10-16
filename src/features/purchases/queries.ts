import "server-only";
import { db } from "@/lib/db";
import { getCatalog } from "@/features/devices/queries";

/** Dados de apoio para o editor de pedidos. */
export async function getPurchaseFormData() {
  const [suppliers, catalog, accessories, accounts] = await Promise.all([
    db.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getCatalog(),
    db.accessory.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, cost: true, price: true } }),
    db.financialAccount.findMany({ where: { deletedAt: null, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
  ]);
  return { suppliers, catalog, accessories, accounts };
}
