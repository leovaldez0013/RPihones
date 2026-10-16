import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { getCatalog } from "@/features/devices/queries";
import { db } from "@/lib/db";
import { OrderForm } from "../order-form";

export const metadata: Metadata = { title: "Nova encomenda" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requirePage("orders.edit");
  const { cliente } = await searchParams;
  const [catalog, c] = await Promise.all([getCatalog(), cliente ? db.customer.findUnique({ where: { id: cliente } }) : null]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nova encomenda" back="/encomendas" />
      <OrderForm
        catalog={catalog}
        defaults={c ? { customer: { id: c.id, name: c.name, cpf: c.cpf, phone: c.phone }, modelId: "", capacity: "", color: "", condition: "", minPrice: 0, maxPrice: 0, dueDate: "", notes: "" } : undefined}
      />
    </div>
  );
}
