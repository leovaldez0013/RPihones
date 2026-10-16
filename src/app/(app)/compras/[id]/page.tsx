import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getPurchaseFormData } from "@/features/purchases/queries";
import { DEVICE_CONDITION, DEVICE_STATUS, ENTRY_STATUS, PURCHASE_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDate } from "@/lib/format";
import { PurchaseEditor, type EditorItem } from "../purchase-editor";
import { PurchaseActions } from "./purchase-actions";

export const metadata: Metadata = { title: "Pedido de compra" };

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("purchases.view");
  const { id } = await params;
  const p = await db.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, items: { include: { accessory: true } } },
  });
  if (!p || p.deletedAt) notFound();
  const canEdit = can(user.role, "purchases.edit");
  const [formData, devices, entries] = await Promise.all([
    getPurchaseFormData(),
    db.device.findMany({ where: { purchaseItemId: { in: p.items.map((i) => i.id) } }, include: { model: true }, orderBy: { createdAt: "asc" } }),
    db.financialEntry.findMany({ where: { originType: "COMPRA", originId: p.id, deletedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);

  const isDraft = p.status === "RASCUNHO";
  const pending = p.items.filter((i) => i.receivedQty < i.quantity);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back="/compras"
        title={
          <span className="flex items-center gap-3">
            Pedido #{p.number} <StatusBadge value={p.status} options={PURCHASE_STATUS} />
          </span>
        }
        description={`${p.supplier.name} · criado em ${formatDate(p.createdAt)}${p.expectedAt ? ` · previsão ${formatDate(p.expectedAt)}` : ""}`}
        actions={
          canEdit && (
            <PurchaseActions
              id={p.id}
              status={p.status}
              canCancel={p.items.every((i) => i.receivedQty === 0) && p.status !== "CANCELADO"}
              dueDate={ymd(p.dueDate)}
              accounts={formData.accounts}
              pending={pending.map((i) => ({
                id: i.id,
                kind: i.kind as "DEVICE" | "ACCESSORY",
                description: i.description,
                condition: i.condition,
                color: i.color,
                remaining: i.quantity - i.receivedQty,
                colors: formData.catalog.find((m) => m.id === i.modelId)?.colors ?? [],
                unitCost: i.unitCost,
              }))}
            />
          )
        }
      />

      {isDraft && canEdit ? (
        <PurchaseEditor
          id={p.id}
          suppliers={formData.suppliers}
          catalog={formData.catalog}
          accessories={formData.accessories}
          initial={{
            supplierId: p.supplierId,
            expectedAt: ymd(p.expectedAt),
            dueDate: ymd(p.dueDate),
            notes: p.notes ?? "",
            items: p.items.map(
              (i): EditorItem => ({
                key: i.id,
                kind: i.kind as "DEVICE" | "ACCESSORY",
                modelId: i.modelId ?? "",
                capacity: i.capacity ?? "",
                color: i.color ?? "",
                condition: i.condition ?? "SEMINOVO",
                accessoryId: i.accessoryId ?? "",
                quantity: i.quantity,
                unitCost: i.unitCost,
                salePrice: i.salePrice,
              }),
            ),
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Itens</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {p.items.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium">{i.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.kind === "DEVICE" ? DEVICE_CONDITION.label(i.condition) : "Acessório"} · {formatBRL(i.unitCost)} un.
                        {i.kind === "DEVICE" && i.salePrice ? ` · venda ${formatBRL(i.salePrice)}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular">
                        <strong>{i.receivedQty}</strong>/{i.quantity} recebidos
                      </p>
                      <p className="text-xs text-muted-foreground tabular">{formatBRL(i.quantity * i.unitCost)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular">{formatBRL(p.total)}</span>
                </div>
              </CardContent>
            </Card>

            {devices.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Aparelhos que entraram no estoque ({devices.length})</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {devices.map((d) => (
                    <Link key={d.id} href={`/estoque/aparelhos/${d.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:underline">
                      <span>
                        {d.model.name} {d.capacity} {d.color} · <span className="font-mono">{d.imei}</span>
                      </span>
                      <StatusBadge value={d.status} options={DEVICE_STATUS} />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Contas a pagar</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {entries.length === 0 && <p className="text-muted-foreground">Gerada automaticamente a cada recebimento.</p>}
                {entries.map((e) => (
                  <Link key={e.id} href={`/financeiro?lancamento=${e.id}`} className="flex items-center justify-between gap-2 rounded-xl border p-3 hover:bg-muted/50">
                    <span>
                      <span className="block font-medium tabular">{formatBRL(e.amount)}</span>
                      <span className="text-xs text-muted-foreground">vence {formatDate(e.dueDate)}</span>
                    </span>
                    <StatusBadge value={e.status} options={ENTRY_STATUS} />
                  </Link>
                ))}
              </CardContent>
            </Card>
            {p.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Observações</CardTitle>
                </CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">{p.notes}</CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
