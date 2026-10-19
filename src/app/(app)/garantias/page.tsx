import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { warrantyState } from "@/features/warranty/service";
import { WarrantyBoard, type ClaimRow, type WarrantyRow } from "./warranty-board";

export const metadata: Metadata = { title: "Garantias" };

export default async function WarrantiesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requirePage("warranty.view");
  const { aba } = await searchParams;
  const now = new Date();
  const [warranties, claims] = await Promise.all([
    db.warranty.findMany({
      where: { status: "ATIVA", endDate: { gte: new Date(now.getTime() - 120 * 86400000) } },
      include: { customer: true, sale: { select: { id: true, number: true } }, serviceOrder: { select: { id: true, number: true } }, claims: { select: { status: true } } },
      orderBy: { endDate: "asc" },
    }),
    db.warrantyClaim.findMany({
      include: { warranty: { include: { customer: true } }, serviceOrder: { select: { id: true, number: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const rows: WarrantyRow[] = warranties.map((w) => ({
    id: w.id,
    number: w.number,
    kind: w.kind,
    state: warrantyState(w, now),
    customer: w.customer ? { id: w.customer.id, name: w.customer.name, phone: w.customer.phone } : null,
    description: w.description,
    imei: w.imei,
    startDate: w.startDate.toISOString(),
    endDate: w.endDate.toISOString(),
    daysLeft: Math.ceil((w.endDate.getTime() - now.getTime()) / 86400000),
    origin: w.sale ? { href: `/vendas/${w.sale.id}`, label: `Venda #${w.sale.number}` } : w.serviceOrder ? { href: `/os/${w.serviceOrder.id}`, label: `OS #${w.serviceOrder.number}` } : null,
    openClaim: w.claims.some((c) => c.status === "EM_ANALISE" || c.status === "APROVADO"),
  }));

  const claimRows: ClaimRow[] = claims.map((c) => ({
    id: c.id,
    number: c.number,
    status: c.status,
    problem: c.problem,
    decisionNote: c.decisionNote,
    createdAt: c.createdAt.toISOString(),
    warrantyNumber: c.warranty.number,
    description: c.warranty.description,
    customer: c.warranty.customer?.name ?? "Consumidor",
    serviceOrder: c.serviceOrder ? { id: c.serviceOrder.id, number: c.serviceOrder.number, status: c.serviceOrder.status } : null,
  }));

  return (
    <div>
      <PageHeader
        title="Garantias"
        description={
          <>
            Geradas automaticamente em cada venda e em cada OS entregue. Prazos em{" "}
            <Link href="/configuracoes/garantias" className="underline underline-offset-2">
              Configurações → Garantias
            </Link>
            .
          </>
        }
      />
      <WarrantyBoard tab={aba ?? "ativas"} rows={rows} claims={claimRows} canClaim={can(user.role, "serviceOrders.edit")} canDecide={can(user.role, "warranty.decide")} />
    </div>
  );
}
