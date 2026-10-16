import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Repeat, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ENTRY_STATUS, PAYMENT_METHOD, SALE_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatCPF, formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { SaleActions } from "./sale-actions";

export const metadata: Metadata = { title: "Venda" };

function Line({ label, value, strong, className }: { label: string; value: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t pt-2 text-base font-semibold" : ""} ${className ?? ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ concluida?: string }> }) {
  const user = await requirePage("sales.view");
  const { id } = await params;
  const { concluida } = await searchParams;
  const s = await db.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      seller: true,
      approvedBy: true,
      items: { include: { device: { include: { model: true } } } },
      payments: { include: { tradeIn: true, account: true } },
      tradeIns: { include: { device: { include: { model: true } } } },
    },
  });
  if (!s || s.deletedAt) notFound();
  if (!can(user.role, "sales.viewAll") && s.sellerId !== user.id) notFound();

  const showMargin = can(user.role, "devices.viewCost");
  const entries = can(user.role, "finance.view")
    ? await db.financialEntry.findMany({ where: { originType: "VENDA", originId: s.id, deletedAt: null }, orderBy: [{ dueDate: "asc" }] })
    : [];
  const profit = s.total - s.cost - s.cardFees - s.commission;
  const isQuote = s.status === "ORCAMENTO";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/vendas"
        title={
          <span className="flex items-center gap-3">
            {isQuote ? "Orçamento" : "Venda"} #{s.number} <StatusBadge value={s.status} options={SALE_STATUS} />
          </span>
        }
        description={`${formatDateTime(s.completedAt ?? s.createdAt)} · vendedor ${s.seller.name}${isQuote && s.validUntil ? ` · válido até ${formatDate(s.validUntil)}` : ""}`}
        actions={
          <SaleActions
            id={s.id}
            status={s.status}
            canCancel={can(user.role, "sales.cancel")}
            canEditQuote={can(user.role, "sales.create")}
            customerPhone={s.customer?.phone ?? null}
            customerName={s.customer?.name ?? null}
          />
        }
      />

      {concluida && s.status === "CONCLUIDA" && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="size-6" />
          <div>
            <p className="font-semibold">Venda concluída com sucesso!</p>
            <p className="text-sm">Estoque e financeiro já foram atualizados. Imprima ou envie os documentos abaixo.</p>
          </div>
        </div>
      )}

      {s.canceledAt && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-200">
          <strong>{SALE_STATUS.label(s.status)}</strong> em {formatDateTime(s.canceledAt)} — {s.cancelReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Itens</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {s.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    {i.deviceId ? (
                      <Link href={`/estoque/aparelhos/${i.deviceId}`} className="font-medium hover:underline">
                        {i.description}
                      </Link>
                    ) : (
                      <p className="font-medium">
                        {i.quantity > 1 && `${i.quantity}× `}
                        {i.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Garantia {i.warrantyDays} dias{showMargin && ` · custo ${formatBRL(i.unitCost * i.quantity)}`}
                      {!i.active && " · devolvido"}
                    </p>
                  </div>
                  <div className="text-right">
                    {i.discount > 0 && <p className="text-xs text-muted-foreground line-through tabular">{formatBRL(i.unitPrice * i.quantity)}</p>}
                    <p className="font-semibold tabular">{formatBRL(i.unitPrice * i.quantity - i.discount)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {s.tradeIns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat className="size-4" /> Aparelho(s) recebido(s) na troca
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {s.tradeIns.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      {t.device ? (
                        <Link href={`/estoque/aparelhos/${t.device.id}`} className="font-medium hover:underline">
                          {t.device.model.name} {t.capacity} {t.color}
                        </Link>
                      ) : (
                        <p className="font-medium">
                          {t.capacity} {t.color}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        IMEI {t.imei} · sugerido {formatBRL(t.suggestedValue)}
                      </p>
                    </div>
                    <span className="font-semibold text-sky-700 tabular dark:text-sky-300">{formatBRL(t.finalValue)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!isQuote && (
            <Card>
              <CardHeader>
                <CardTitle>Pagamentos</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {s.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      {PAYMENT_METHOD.label(p.method)}
                      {p.installments > 1 && ` em ${p.installments}x`}
                      {p.interest > 0 && <span className="text-xs text-muted-foreground"> · cliente pagou {formatBRL(p.amount + p.interest)}</span>}
                      {showMargin && p.feeAmount > 0 && <span className="text-xs text-muted-foreground"> · taxa {formatBRL(p.feeAmount)}</span>}
                    </span>
                    <span className="font-medium tabular">{formatBRL(p.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {entries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Lançamentos financeiros</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {e.description}
                      <span className="block text-xs text-muted-foreground">
                        {e.status === "PAGA" ? `recebido ${formatDate(e.paidAt)}` : `previsto ${formatDate(e.dueDate)}`}
                        {e.netAmount !== e.amount && ` · líquido ${formatBRL(e.netAmount)}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{formatBRL(e.amount)}</span>
                      <StatusBadge value={e.status} options={ENTRY_STATUS} />
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" /> Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {s.customer ? (
                <Link href={`/clientes/${s.customer.id}`} className="block hover:underline">
                  <p className="font-medium">{s.customer.name}</p>
                  <p className="text-muted-foreground">{[s.customer.cpf && formatCPF(s.customer.cpf), s.customer.phone && formatPhone(s.customer.phone)].filter(Boolean).join(" · ")}</p>
                </Link>
              ) : (
                <p className="text-muted-foreground">Consumidor não identificado</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <Line label="Subtotal" value={formatBRL(s.subtotal)} />
              {s.itemDiscount + s.discount > 0 && <Line label="Descontos" value={`− ${formatBRL(s.itemDiscount + s.discount)}`} />}
              <Line label="Total" value={formatBRL(s.total)} strong />
              {s.interest > 0 && <Line label="Juros pagos pelo cliente" value={formatBRL(s.interest)} />}
              {s.approvedBy && <p className="mt-1 text-xs text-muted-foreground">Desconto aprovado por {s.approvedBy.name}</p>}
              {showMargin && !isQuote && (
                <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-muted/60 p-3">
                  <Line label="Custo dos itens" value={`− ${formatBRL(s.cost)}`} />
                  <Line label="Taxas de cartão" value={`− ${formatBRL(s.cardFees)}`} />
                  <Line label="Comissão" value={`− ${formatBRL(s.commission)}`} />
                  <Line label="Lucro" value={formatBRL(profit)} strong className={profit < 0 ? "text-destructive" : "text-emerald-600"} />
                  <p className="text-right text-xs text-muted-foreground">margem {s.total ? ((profit / s.total) * 100).toFixed(1).replace(".", ",") : 0}%</p>
                </div>
              )}
            </CardContent>
          </Card>

          {s.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Observações</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{s.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
