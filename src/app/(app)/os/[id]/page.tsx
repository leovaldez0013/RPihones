import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentsCard } from "@/components/documents/documents-card";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db, parseJson } from "@/lib/db";
import { DEVICE_STATUS, ENTRY_STATUS, SO_KIND, SO_STATUS, TRADE_IN_CHECKLIST } from "@/domain/constants";
import { SO_BOARD, SO_CLOSED, soTotals } from "@/domain/service-order";
import { formatBRL } from "@/domain/money";
import { formatCPF, formatDateTime, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SoActions } from "./so-actions";
import { SoEditForm } from "./so-edit-form";
import { PartsCard } from "./parts-card";

export const metadata: Metadata = { title: "Ordem de serviço" };

export default async function ServiceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("serviceOrders.view");
  const { id } = await params;
  const o = await db.serviceOrder.findUnique({
    where: { id },
    include: { device: { include: { model: true } }, customer: true, technician: true, parts: { include: { accessory: true }, orderBy: { id: "asc" } }, documents: { orderBy: { createdAt: "asc" } } },
  });
  if (!o || o.deletedAt) notFound();

  const closed = SO_CLOSED.includes(o.status);
  const canEdit = can(user.role, "serviceOrders.edit") && !closed;
  const showCost = can(user.role, "devices.viewCost") || user.role === "TECNICO";
  const showMargin = can(user.role, "devices.viewCost");
  const [technicians, accessories, entries] = await Promise.all([
    db.user.findMany({ where: { active: true, role: { in: ["TECNICO", "GERENTE", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    canEdit
      ? db.accessory.findMany({ where: { deletedAt: null, active: true, quantity: { gt: 0 } }, orderBy: [{ isPart: "desc" }, { name: "asc" }], select: { id: true, name: true, sku: true, quantity: true, price: true, isPart: true } })
      : [],
    can(user.role, "finance.view") ? db.financialEntry.findMany({ where: { originType: "OS", originId: o.id } }) : [],
  ]);
  const t = soTotals(o);
  const checklist = parseJson<Record<string, boolean>>(o.checklist, {});
  const problems = TRADE_IN_CHECKLIST.filter((c) => checklist[c.key] === false);
  const step = (SO_BOARD as readonly string[]).indexOf(o.status);
  const title = o.device ? `${o.device.model.name} ${o.device.capacity} ${o.device.color}` : (o.deviceDescription ?? "Aparelho do cliente");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/os"
        title={
          <span className="flex flex-wrap items-center gap-3">
            OS #{o.number} <StatusBadge value={o.status} options={SO_STATUS} />
            <StatusBadge value={o.kind} options={SO_KIND} />
          </span>
        }
        description={`${title} · aberta em ${formatDateTime(o.createdAt)}`}
        actions={canEdit && <SoActions so={{ id: o.id, number: o.number, kind: o.kind, price: o.price, status: o.status }} />}
      />

      {o.status !== "CANCELADA" && (
        <div className="mb-6 grid grid-cols-6 gap-1.5">
          {[...SO_BOARD, "ENTREGUE"].map((s, i) => {
            const done = o.status === "ENTREGUE" || i <= step;
            return (
              <div key={s} className="flex flex-col gap-1.5">
                <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : "bg-muted")} />
                <span className={cn("hidden text-xs sm:block", done ? "font-medium" : "text-muted-foreground")}>{SO_STATUS.label(s)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <SoEditForm
            readOnly={!canEdit}
            showCost={showCost}
            technicians={technicians}
            so={{
              id: o.id,
              kind: o.kind,
              problem: o.problem,
              services: o.services ?? "",
              diagnosis: o.diagnosis ?? "",
              laborCost: o.laborCost,
              price: o.price,
              priority: o.priority,
              technicianId: o.technicianId ?? "",
              dueDate: o.dueDate ? o.dueDate.toISOString().slice(0, 10) : "",
              checklist,
              photos: parseJson<string[]>(o.photos, []),
            }}
          />
          <PartsCard
            soId={o.id}
            kind={o.kind}
            canEdit={canEdit}
            showCost={showCost}
            accessories={accessories}
            parts={o.parts.map((p) => ({ id: p.id, name: p.accessory.name, sku: p.accessory.sku, quantity: p.quantity, unitCost: p.unitCost, unitPrice: p.unitPrice }))}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Aparelho</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {o.device ? (
                <Link href={`/estoque/aparelhos/${o.device.id}`} className="hover:underline">
                  <p className="font-medium">{title}</p>
                  <p className="font-mono text-xs text-muted-foreground">IMEI {o.device.imei}</p>
                  <StatusBadge value={o.device.status} options={DEVICE_STATUS} className="mt-1.5" />
                </Link>
              ) : (
                <>
                  <p className="font-medium">{title}</p>
                  {o.imei && <p className="font-mono text-xs text-muted-foreground">IMEI {o.imei}</p>}
                </>
              )}
              {o.kind === "CLIENTE" && (
                <div className="mt-2 rounded-xl bg-muted/60 p-3 text-xs">
                  <p className="mb-1 font-medium">Checklist de entrada</p>
                  {problems.length === 0 ? <p className="text-muted-foreground">Tudo OK na entrada.</p> : <p className="text-amber-700 dark:text-amber-400">Com problema: {problems.map((p) => p.label).join(", ")}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {o.customer && (
            <Card>
              <CardHeader>
                <CardTitle>Cliente</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Link href={`/clientes/${o.customer.id}`} className="hover:underline">
                  <p className="font-medium">{o.customer.name}</p>
                  <p className="text-muted-foreground">{[o.customer.cpf && formatCPF(o.customer.cpf), formatPhone(o.customer.phone)].filter(Boolean).join(" · ")}</p>
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Valores</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {showCost && (
                <>
                  <Row label="Mão de obra (custo)" value={formatBRL(o.laborCost)} />
                  <Row label="Peças (custo)" value={formatBRL(t.partsCost)} />
                  <Row label="Custo interno" value={formatBRL(t.cost)} strong />
                </>
              )}
              {o.kind === "CLIENTE" && (
                <>
                  <Row label="Valor cobrado" value={formatBRL(o.price)} strong />
                  {showMargin && <Row label="Margem" value={formatBRL(t.margin)} tone={t.margin < 0 ? "red" : "green"} />}
                </>
              )}
              {o.kind === "INTERNA" && o.device && showMargin && (
                <p className="mt-1 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  {o.status === "ENTREGUE" ? "Custo já somado ao aparelho" : "Ao concluir, o custo interno é somado ao custo real do aparelho"} (custo real atual: {formatBRL(o.device.acquisitionCost + o.device.serviceCost)}).
                </p>
              )}
              {entries.map((e) => (
                <div key={e.id} className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span>{e.description}</span>
                  <StatusBadge value={e.status} options={ENTRY_STATUS} />
                </div>
              ))}
              {o.deliveredAt && <p className="text-xs text-muted-foreground">Entregue em {formatDateTime(o.deliveredAt)}</p>}
            </CardContent>
          </Card>

          <DocumentsCard docs={o.documents} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "red" | "green" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular", strong && "font-semibold", tone === "red" && "text-red-600 dark:text-red-400", tone === "green" && "text-emerald-600 dark:text-emerald-400")}>{value}</span>
    </div>
  );
}
