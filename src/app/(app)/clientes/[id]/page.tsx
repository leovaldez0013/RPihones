import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cake, ShieldCheck, Mail, MapPin, MessageCircle, Phone, ShoppingBag, Smartphone, Wrench, PackageSearch, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatBRL } from "@/domain/money";
import { ORDER_STATUS, SALE_STATUS, SO_STATUS, TASK_TYPE, WARRANTY_CLAIM_STATUS } from "@/domain/constants";
import { templateDef } from "@/domain/marketing";
import { formatCEP, formatCPF, formatDate, formatPhone, whatsappLink, imeiText } from "@/lib/format";
import { CustomerActions } from "./customer-actions";

export const metadata: Metadata = { title: "Cliente" };

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular">{value}</p>
    </div>
  );
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("customers.view");
  const { id } = await params;
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      sales: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { items: { include: { device: { include: { model: true } } } }, seller: true },
      },
      tradeIns: { orderBy: { createdAt: "desc" }, include: { sale: true } },
      serviceOrders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      orders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      tasks: { where: { doneAt: null }, orderBy: { dueDate: "asc" }, take: 5 },
      campaignSends: { orderBy: { createdAt: "desc" }, take: 5 },
      warranties: { where: { status: "ATIVA" }, orderBy: { endDate: "desc" }, take: 10, include: { claims: { orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!c || c.deletedAt) notFound();

  const done = c.sales.filter((s) => s.status === "CONCLUIDA");
  const total = done.reduce((a, s) => a + s.total, 0);
  const last = done[0]?.completedAt;
  const devices = done.flatMap((s) => s.items.filter((i) => i.kind === "DEVICE" && i.active && i.device).map((i) => ({ sale: s, item: i })));
  const tradeModels = await db.deviceModel.findMany({ where: { id: { in: c.tradeIns.map((t) => t.modelId) } } });
  const modelName = Object.fromEntries(tradeModels.map((m) => [m.id, m.name]));
  const address = [c.street && `${c.street}, ${c.number ?? "s/n"}`, c.complement, c.district, c.city && `${c.city}/${c.state ?? ""}`, c.cep && formatCEP(c.cep)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/clientes"
        title={c.name}
        description={c.cpf ? `CPF ${formatCPF(c.cpf)}` : "Sem CPF cadastrado"}
        actions={
          <CustomerActions
            canEdit={can(user.role, "customers.edit")}
            canSell={can(user.role, "sales.create")}
            customer={{
              id: c.id,
              name: c.name,
              cpf: c.cpf ?? "",
              phone: c.phone ?? "",
              email: c.email ?? "",
              birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : "",
              cep: c.cep ?? "",
              street: c.street ?? "",
              number: c.number ?? "",
              complement: c.complement ?? "",
              district: c.district ?? "",
              city: c.city ?? "",
              state: c.state ?? "",
              notes: c.notes ?? "",
              marketingConsent: c.marketingConsent,
            }}
          />
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total gasto" value={formatBRL(total)} />
        <Stat label="Compras" value={done.length} />
        <Stat label="Ticket médio" value={formatBRL(done.length ? Math.round(total / done.length) : 0)} />
        <Stat label="Última compra" value={last ? formatDate(last) : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Contato</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {c.phone && (
              <div className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" /> <span className="whitespace-nowrap">{formatPhone(c.phone)}</span>
                <a href={whatsappLink(c.phone, `Olá, ${c.name.split(" ")[0]}!`)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-emerald-600 hover:underline">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </div>
            )}
            {c.email && (
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" /> {c.email}
              </div>
            )}
            {c.birthDate && (
              <div className="flex items-center gap-2">
                <Cake className="size-4 text-muted-foreground" /> {formatDate(c.birthDate)}
              </div>
            )}
            {address && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {address}
              </div>
            )}
            <div className="mt-1 border-t pt-3">
              {c.marketingConsent ? (
                <StatusBadge tone="green">Aceita marketing desde {formatDate(c.consentAt)}</StatusBadge>
              ) : (
                <StatusBadge tone="gray">Não aceita mensagens de marketing</StatusBadge>
              )}
            </div>
            {c.notes && <p className="rounded-xl bg-muted/60 p-3 whitespace-pre-wrap">{c.notes}</p>}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          {c.warranties.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Garantias
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y text-sm">
                {c.warranties.map((w) => {
                  const expired = w.endDate < new Date();
                  const claim = w.claims[0];
                  return (
                    <Link key={w.id} href="/garantias" className="flex items-center justify-between gap-2 py-2 hover:underline">
                      <span className="min-w-0">
                        <span className="block truncate">{w.description}</span>
                        {claim && (
                          <span className="text-xs text-muted-foreground">
                            Acionada: {claim.problem} — {WARRANTY_CLAIM_STATUS.label(claim.status)}
                            {claim.status === "NEGADO" && claim.decisionNote ? ` (${claim.decisionNote})` : ""}
                          </span>
                        )}
                      </span>
                      <StatusBadge tone={expired ? "gray" : "green"}>{expired ? `venceu ${formatDate(w.endDate)}` : `até ${formatDate(w.endDate)}`}</StatusBadge>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {(c.tasks.length > 0 || c.campaignSends.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="size-4" /> Relacionamento
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y text-sm">
                {c.tasks.map((t) => (
                  <Link key={t.id} href="/marketing" className="flex items-center justify-between gap-2 py-2 hover:underline">
                    <span className="flex items-center gap-2">
                      <StatusBadge value={t.type} options={TASK_TYPE} className="h-5 px-2" /> {t.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(t.dueDate)}</span>
                  </Link>
                ))}
                {c.campaignSends.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="truncate text-muted-foreground" title={m.message}>
                      WhatsApp: {templateDef(m.templateKey)?.name ?? m.templateKey}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(m.createdAt)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="size-4" /> Aparelhos comprados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum aparelho comprado ainda.</p>
              ) : (
                <div className="divide-y">
                  {devices.map(({ sale, item }) => (
                    <Link key={item.id} href={`/estoque/aparelhos/${item.deviceId}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline">
                      <span>
                        <span className="font-medium">{item.device!.model.name} {item.device!.capacity}</span>{" "}
                        <span className="text-muted-foreground">{item.device!.color} · {imeiText(item.device!.imei)}</span>
                      </span>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {formatDate(sale.completedAt)} · garantia {item.warrantyDays} dias
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="size-4" /> Vendas e orçamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {c.sales.length === 0 ? (
                <EmptyState icon={ShoppingBag} title="Sem vendas" className="py-6" />
              ) : (
                <div className="divide-y">
                  {c.sales.map((s) => (
                    <Link key={s.id} href={`/vendas/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline">
                      <span>
                        Venda #{s.number} · {formatDate(s.completedAt ?? s.createdAt)} · {s.seller.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium tabular">{formatBRL(s.total)}</span>
                        <StatusBadge value={s.status} options={SALE_STATUS} />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {(c.tradeIns.length > 0 || c.serviceOrders.length > 0 || c.orders.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Trocas, OS e encomendas</CardTitle>
              </CardHeader>
              <CardContent className="divide-y text-sm">
                {c.tradeIns.map((t) => (
                  <Link key={t.id} href={t.deviceId ? `/estoque/aparelhos/${t.deviceId}` : "#"} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                    <span className="flex items-center gap-2">
                      <Repeat className="size-4 text-muted-foreground" /> Troca: {modelName[t.modelId] ?? "aparelho"} {t.capacity}
                    </span>
                    <span className="tabular">
                      {formatBRL(t.finalValue)} · {formatDate(t.createdAt)}
                    </span>
                  </Link>
                ))}
                {c.serviceOrders.map((o) => (
                  <Link key={o.id} href={`/os/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                    <span className="flex items-center gap-2">
                      <Wrench className="size-4 text-muted-foreground" /> OS #{o.number} — {o.problem}
                    </span>
                    <StatusBadge value={o.status} options={SO_STATUS} />
                  </Link>
                ))}
                {c.orders.map((o) => (
                  <Link key={o.id} href={`/encomendas/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                    <span className="flex items-center gap-2">
                      <PackageSearch className="size-4 text-muted-foreground" /> Encomenda #{o.number} — {o.modelName}
                    </span>
                    <StatusBadge value={o.status} options={ORDER_STATUS} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
