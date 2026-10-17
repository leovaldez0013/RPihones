import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer, ScanLine, BatteryMedium, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getDevice } from "@/features/devices/queries";
import { DEVICE_CONDITION, DEVICE_ORIGIN, DEVICE_STATUS, SALE_STATUS, SO_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { daysSince, formatDate, formatDateTime, formatPct } from "@/lib/format";
import { verdict } from "@/features/imei/service";
import { DeleteDeviceButton } from "./delete-button";

export const metadata: Metadata = { title: "Aparelho" };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children ?? "—"}</dd>
    </div>
  );
}

const REF_HREF: Record<string, (id: string) => string> = {
  VENDA: (id) => `/vendas/${id}`,
  OS: (id) => `/os/${id}`,
  COMPRA: (id) => `/compras/${id}`,
  ENCOMENDA: (id) => `/encomendas/${id}`,
};

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("devices.view");
  const { id } = await params;
  const d = await getDevice(id, user.role);
  if (!d) notFound();
  const canEdit = can(user.role, "devices.edit") && !d.deletedAt;
  const margin = d.realCost != null ? d.salePrice - d.realCost : null;
  const lastCheck = d.imeiChecks[0];
  const blocked = lastCheck && verdict(lastCheck) === "BLOQUEADO";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/estoque/aparelhos"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {d.model.name} {d.capacity}
            <StatusBadge value={d.status} options={DEVICE_STATUS} />
            {d.deletedAt && <StatusBadge tone="red">Excluído</StatusBadge>}
          </span>
        }
        description={
          <span>
            {d.color} · IMEI <span className="font-mono">{d.imei}</span>
          </span>
        }
        actions={
          <>
            {can(user.role, "imei.check") && (
              <Button asChild variant="outline" size="lg">
                <Link href={`/imei?imei=${d.imei}&deviceId=${d.id}`}>
                  <ScanLine /> Testar IMEI
                </Link>
              </Button>
            )}
            {can(user.role, "serviceOrders.edit") && !d.deletedAt && ["DISPONIVEL", "EM_AVALIACAO", "DEVOLVIDO"].includes(d.status) && !d.serviceOrders.some((o) => !["ENTREGUE", "CANCELADA"].includes(o.status)) && (
              <Button asChild variant="outline" size="lg">
                <Link href={`/os/nova?aparelho=${d.id}`}>
                  <Wrench /> Abrir OS
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="lg">
              <Link href={`/estoque/etiquetas?aparelhos=${d.id}`} target="_blank">
                <Printer /> Etiqueta
              </Link>
            </Button>
            {canEdit && (
              <Button asChild size="lg">
                <Link href={`/estoque/aparelhos/${d.id}/editar`}>
                  <Pencil /> Editar
                </Link>
              </Button>
            )}
            {canEdit && <DeleteDeviceButton id={d.id} />}
          </>
        }
      />

      {blocked && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-red-500 bg-red-500/10 p-4 text-red-900 dark:text-red-100">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <ShieldAlert className="size-5" />
          </span>
          <div>
            <p className="font-semibold">IMEI bloqueado na última consulta ({formatDateTime(lastCheck.createdAt)})</p>
            <p className="text-sm opacity-90">Consta em lista de bloqueio (perda/roubo). Não venda este aparelho até resolver a situação com o fornecedor.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Info label="Condição">
                  <StatusBadge value={d.condition} options={DEVICE_CONDITION} />
                </Info>
                <Info label="Grade estético">{d.grade}</Info>
                <Info label="Bateria">
                  {d.batteryHealth != null ? (
                    <span className="inline-flex items-center gap-1">
                      <BatteryMedium className="size-4" /> {d.batteryHealth}%
                    </span>
                  ) : null}
                </Info>
                <Info label="IMEI 2">{d.imei2 && <span className="font-mono">{d.imei2}</span>}</Info>
                <Info label="Nº de série">{d.serial && <span className="font-mono">{d.serial}</span>}</Info>
                <Info label="Origem">{DEVICE_ORIGIN.label(d.origin)}</Info>
                <Info label="Fornecedor">{d.supplier?.name}</Info>
                <Info label="Entrada">
                  {formatDate(d.entryDate)}{" "}
                  {d.status !== "VENDIDO" && <span className="text-muted-foreground">({daysSince(d.entryDate)} dias)</span>}
                </Info>
                <Info label="Garantia Apple">
                  {d.appleWarrantyUntil ? (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="size-4 text-emerald-600" /> até {formatDate(d.appleWarrantyUntil)}
                    </span>
                  ) : null}
                </Info>
              </dl>
              {d.notes && <p className="mt-5 rounded-xl bg-muted/60 p-3 text-sm whitespace-pre-wrap">{d.notes}</p>}
            </CardContent>
          </Card>

          {d.photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Fotos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {d.photos.map((p) => (
                  <a key={p} href={p} target="_blank" rel="noreferrer" className="size-28 overflow-hidden rounded-xl border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="size-full object-cover" />
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {(d.saleItems.length > 0 || d.serviceOrders.length > 0 || d.tradeIn) && (
            <Card>
              <CardHeader>
                <CardTitle>Vínculos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {d.tradeIn && (
                  <Link href={d.tradeIn.sale ? `/vendas/${d.tradeIn.sale.id}` : "#"} className="flex justify-between py-2 text-sm hover:underline">
                    <span>Recebido na troca de {d.tradeIn.customer?.name ?? "cliente"}</span>
                    <span>{formatDate(d.tradeIn.createdAt)}</span>
                  </Link>
                )}
                {d.saleItems.map((i) => (
                  <Link key={i.id} href={`/vendas/${i.saleId}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:underline">
                    <span>
                      Venda #{i.sale.number} — {i.sale.customer?.name ?? "Consumidor"}
                    </span>
                    <span className="flex items-center gap-2">
                      {formatBRL(i.unitPrice - i.discount)} <StatusBadge value={i.sale.status} options={SALE_STATUS} />
                    </span>
                  </Link>
                ))}
                {d.serviceOrders.map((o) => (
                  <Link key={o.id} href={`/os/${o.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:underline">
                    <span>
                      OS #{o.number} — {o.problem}
                    </span>
                    <StatusBadge value={o.status} options={SO_STATUS} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Valores</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Preço de venda</span>
                <span className="text-2xl font-semibold tabular">{formatBRL(d.salePrice)}</span>
              </div>
              {d.showCost && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo de aquisição</span>
                    <span className="tabular">{formatBRL(d.acquisitionCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custos de OS</span>
                    <span className="tabular">{formatBRL(d.serviceCost)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-muted-foreground">Custo real</span>
                    <span className="font-medium tabular">{formatBRL(d.realCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margem</span>
                    <span className={`font-semibold tabular ${margin! < 0 ? "text-destructive" : "text-emerald-600"}`}>
                      {formatBRL(margin)} {d.salePrice ? `(${formatPct((margin! / d.salePrice) * 100)})` : ""}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {d.imeiChecks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Testes de IMEI</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y text-sm">
                {d.imeiChecks.map((c) => {
                  const v = verdict(c);
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(c.createdAt)}
                        {c.user && ` · ${c.user.name.split(" ")[0]}`}
                        {c.provider === "mock" && " · demo"}
                      </span>
                      <StatusBadge tone={v === "BLOQUEADO" ? "red" : v === "ATENCAO" ? "amber" : v === "LIVRE" ? "green" : "gray"}>
                        {v === "BLOQUEADO" ? "Bloqueado" : v === "ATENCAO" ? "Buscar iPhone ativo" : v === "LIVRE" ? "Sem restrição" : "Validação local"}
                      </StatusBadge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Histórico do aparelho</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                items={d.events.map((e) => ({
                  id: e.id,
                  type: e.type,
                  description: e.description,
                  createdAt: e.createdAt,
                  user: e.user?.name,
                  href: e.refType && e.refId && REF_HREF[e.refType] ? REF_HREF[e.refType](e.refId) : null,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
