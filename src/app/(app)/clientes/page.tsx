import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { CustomersTable } from "./customers-table";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage() {
  const user = await requirePage("customers.view");
  const [customers, stats] = await Promise.all([
    db.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    db.sale.groupBy({
      by: ["customerId"],
      where: { status: "CONCLUIDA", deletedAt: null, customerId: { not: null } },
      _sum: { total: true },
      _max: { completedAt: true },
      _count: true,
    }),
  ]);
  const map = new Map(stats.map((s) => [s.customerId, s]));
  return (
    <div>
      <PageHeader title="Clientes" description="Cadastro, histórico de compras e consentimento de marketing." />
      <CustomersTable
        canEdit={can(user.role, "customers.edit")}
        rows={customers.map((c) => {
          const s = map.get(c.id);
          return {
            id: c.id,
            name: c.name,
            cpf: c.cpf,
            phone: c.phone,
            email: c.email,
            city: c.city,
            birthDate: c.birthDate?.toISOString() ?? null,
            marketingConsent: c.marketingConsent,
            purchases: s?._count ?? 0,
            totalSpent: s?._sum.total ?? 0,
            lastPurchase: s?._max.completedAt?.toISOString() ?? null,
          };
        })}
      />
    </div>
  );
}
