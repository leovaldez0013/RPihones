import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { SO_CLOSED } from "@/domain/service-order";
import { NewServiceOrderForm } from "./form";
import { getCatalog } from "@/features/devices/queries";

export const metadata: Metadata = { title: "Nova OS" };

export default async function NewServiceOrderPage({ searchParams }: { searchParams: Promise<{ aparelho?: string; cliente?: string }> }) {
  const user = await requirePage("serviceOrders.edit");
  const { aparelho, cliente } = await searchParams;
  const [catalog, technicians, devices, customer] = await Promise.all([
    getCatalog(),
    db.user.findMany({ where: { active: true, role: { in: ["TECNICO", "GERENTE", "ADMIN"] } }, orderBy: [{ role: "desc" }, { name: "asc" }], select: { id: true, name: true, role: true } }),
    db.device.findMany({
      where: { deletedAt: null, status: { in: ["DISPONIVEL", "EM_AVALIACAO", "DEVOLVIDO"] }, serviceOrders: { none: { status: { notIn: SO_CLOSED }, deletedAt: null } } },
      include: { model: true },
      orderBy: [{ status: "desc" }, { entryDate: "desc" }],
    }),
    cliente ? db.customer.findUnique({ where: { id: cliente }, select: { id: true, name: true, cpf: true, phone: true } }) : null,
  ]);
  const options = devices.map((d) => ({
    id: d.id,
    label: `${d.model.name} ${d.capacity} ${d.color}`,
    imei: d.imei,
    status: d.status,
    battery: d.batteryHealth,
  }));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nova ordem de serviço" back="/os" />
      <NewServiceOrderForm
        catalog={catalog.map((m) => ({ id: m.id, name: m.name, colors: m.colors }))}
        technicians={technicians}
        devices={options}
        defaultDeviceId={aparelho && options.some((o) => o.id === aparelho) ? aparelho : null}
        defaultCustomer={customer}
        defaultTechnicianId={user.role === "TECNICO" ? user.id : null}
      />
    </div>
  );
}
