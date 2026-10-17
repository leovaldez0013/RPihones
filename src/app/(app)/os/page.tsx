import type { Metadata } from "next";
import Link from "next/link";
import { subDays } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { SO_BOARD } from "@/domain/service-order";
import { Board, type SoCard } from "./board";

export const metadata: Metadata = { title: "Ordens de serviço" };

export default async function ServiceOrdersPage() {
  const user = await requirePage("serviceOrders.view");
  const [open, delivered] = await Promise.all([
    db.serviceOrder.findMany({
      where: { deletedAt: null, status: { in: [...SO_BOARD] } },
      include: { device: { include: { model: true } }, customer: true, technician: true, _count: { select: { parts: true } } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.serviceOrder.findMany({
      where: { deletedAt: null, status: "ENTREGUE", deliveredAt: { gte: subDays(new Date(), 14) } },
      include: { device: { include: { model: true } }, customer: true, technician: true, _count: { select: { parts: true } } },
      orderBy: { deliveredAt: "desc" },
    }),
  ]);

  const cards: SoCard[] = [...open, ...delivered].map((o) => ({
    id: o.id,
    number: o.number,
    kind: o.kind,
    status: o.status,
    priority: o.priority,
    title: o.device ? `${o.device.model.name} ${o.device.capacity} ${o.device.color}` : (o.deviceDescription ?? "Aparelho"),
    imei: o.imei,
    problem: o.problem,
    customer: o.customer?.name ?? null,
    technician: o.technician?.name ?? null,
    technicianId: o.technicianId,
    price: o.price,
    parts: o._count.parts,
    dueDate: o.dueDate?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Ordens de serviço"
        description="Arraste os cartões entre as colunas. Ao soltar em “Entregue”, a OS é concluída."
        actions={
          can(user.role, "serviceOrders.edit") && (
            <Button asChild size="lg">
              <Link href="/os/nova">
                <Plus /> Nova OS
              </Link>
            </Button>
          )
        }
      />
      <Board cards={cards} userId={user.id} canEdit={can(user.role, "serviceOrders.edit")} />
    </div>
  );
}
