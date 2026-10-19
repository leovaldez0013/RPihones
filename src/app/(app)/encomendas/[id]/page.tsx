import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentsCard } from "@/components/documents/documents-card";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { DEVICE_CONDITION, ENTRY_STATUS, ORDER_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatCPF, formatDate, formatDateTime, formatPhone, imeiText } from "@/lib/format";
import { compatibleDevices } from "@/features/orders/service";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Encomenda" };

const STEPS = ["ABERTA", "EM_BUSCA", "CHEGOU", "CLIENTE_AVISADO", "ENTREGUE"];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("orders.view");
  const { id } = await params;
  const o = await db.order.findUnique({ where: { id }, include: { customer: true, sale: true } });
  if (!o || o.deletedAt) notFound();
  const [device, matches, docs, entries, store] = await Promise.all([
    o.deviceId ? db.device.findUnique({ where: { id: o.deviceId }, include: { model: true } }) : null,
    ["ENTREGUE", "CANCELADA"].includes(o.status) ? [] : compatibleDevices(db, o.id),
    db.document.findMany({ where: { orderId: o.id }, orderBy: { createdAt: "asc" } }),
    can(user.role, "finance.view") ? db.financialEntry.findMany({ where: { originType: "ENCOMENDA", originId: o.id } }) : [],
    db.storeSettings.findUnique({ where: { id: "default" }, select: { name: true } }),
  ]);
  const step = STEPS.indexOf(o.status);
  const open = !["ENTREGUE", "CANCELADA"].includes(o.status);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/encomendas"
        title={
          <span className="flex items-center gap-3">
            Encomenda #{o.number} <StatusBadge value={o.status} options={ORDER_STATUS} />
          </span>
        }
        description={`${o.customer.name} · criada em ${formatDateTime(o.createdAt)}`}
        actions={
          can(user.role, "orders.edit") &&
          open && (
            <OrderActions
              id={o.id}
              status={o.status}
              hasDevice={!!o.deviceId}
              deposit={o.deposit}
              canSell={can(user.role, "sales.create")}
              whatsapp={
                o.customer.phone && device
                  ? {
                      phone: o.customer.phone,
                      message: `Olá, ${o.customer.name.split(" ")[0]}! Boa notícia: chegou o seu ${device.model.name} ${device.capacity} ${device.color} da encomenda #${o.number}. Ele já está reservado para você aqui na ${store?.name ?? "loja"}. Quando pode passar para retirar?`,
                    }
                  : null
              }
            />
          )
        }
      />

      {o.status !== "CANCELADA" && (
        <div className="mb-6 grid grid-cols-5 gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-col gap-1.5">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <span className={`text-xs ${i <= step ? "font-medium text-foreground" : "text-muted-foreground"}`}>{ORDER_STATUS.label(s)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Aparelho desejado</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Modelo</dt>
                  <dd className="font-medium">{o.modelName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Capacidade</dt>
                  <dd className="font-medium">{o.capacity ?? "qualquer"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cor</dt>
                  <dd className="font-medium">{o.color ?? "qualquer"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Condição</dt>
                  <dd className="font-medium">{o.condition ? DEVICE_CONDITION.label(o.condition) : "qualquer"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Faixa de preço</dt>
                  <dd className="font-medium">{o.minPrice || o.maxPrice ? `${o.minPrice ? formatBRL(o.minPrice) : "—"} a ${o.maxPrice ? formatBRL(o.maxPrice) : "—"}` : "a combinar"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Previsão</dt>
                  <dd className="font-medium">{formatDate(o.dueDate)}</dd>
                </div>
              </dl>
              {o.notes && <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm whitespace-pre-wrap">{o.notes}</p>}
            </CardContent>
          </Card>

          {device && (
            <Card className="border-emerald-500/30">
              <CardHeader>
                <CardTitle>Aparelho reservado</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href={`/estoque/aparelhos/${device.id}`} className="flex items-center justify-between gap-3 hover:underline">
                  <span>
                    <span className="font-medium">
                      {device.model.name} {device.capacity} {device.color}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {imeiText(device.imei)} · {DEVICE_CONDITION.label(device.condition)}
                      {device.batteryHealth != null && ` · bateria ${device.batteryHealth}%`}
                    </span>
                  </span>
                  <span className="text-lg font-semibold tabular">{formatBRL(device.salePrice)}</span>
                </Link>
              </CardContent>
            </Card>
          )}

          {open && (
            <Card>
              <CardHeader>
                <CardTitle>Aparelhos compatíveis em estoque ({matches.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum no momento. Você será notificado quando entrar um compatível.</p>
                ) : (
                  <div className="divide-y">
                    {matches.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <Link href={`/estoque/aparelhos/${d.id}`} className="hover:underline">
                          <span className="font-medium">
                            {d.model.name} {d.capacity} {d.color}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {DEVICE_CONDITION.label(d.condition)} · {d.batteryHealth != null ? `bateria ${d.batteryHealth}% · ` : ""}{imeiText(d.imei)}
                          </span>
                        </Link>
                        <span className="flex items-center gap-3">
                          <span className="font-semibold tabular">{formatBRL(d.salePrice)}</span>
                          {can(user.role, "orders.edit") && <OrderActions.Reserve orderId={o.id} deviceId={d.id} />}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
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
          <Card>
            <CardHeader>
              <CardTitle>Sinal</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-2xl font-semibold tabular">{formatBRL(o.deposit)}</p>
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>{e.description}</span>
                  <StatusBadge value={e.status} options={ENTRY_STATUS} />
                </div>
              ))}
              {o.sale && (
                <Link href={`/vendas/${o.sale.id}`} className="text-primary hover:underline">
                  Entregue na venda #{o.sale.number}
                </Link>
              )}
            </CardContent>
          </Card>
          <DocumentsCard docs={docs} />
        </div>
      </div>
    </div>
  );
}
