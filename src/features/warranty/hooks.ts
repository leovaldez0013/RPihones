// Geração automática de garantias (chamada pela venda e pela entrega de OS).
// Fica separado do service de garantias para não criar dependência circular com OS/vendas.
import type { Tx } from "@/lib/db";
import { nextSequence } from "@/lib/db";
import { warrantyUntil } from "@/domain/sale";
import { getWarrantyDays } from "@/features/sales/config";

/** Uma garantia por item da venda (aparelho, acessório, serviço) com prazo > 0. Idempotente. */
export async function createSaleWarranties(tx: Tx, saleId: string) {
  const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { items: { include: { device: true, warranty: true } } } });
  const start = sale.completedAt ?? new Date();
  for (const i of sale.items) {
    if (!i.active || i.warrantyDays <= 0 || i.warranty) continue;
    await tx.warranty.create({
      data: {
        number: await nextSequence(tx, "WARRANTY"),
        kind: "VENDA",
        customerId: sale.customerId,
        saleId: sale.id,
        saleItemId: i.id,
        deviceId: i.deviceId,
        description: i.quantity > 1 ? `${i.quantity}× ${i.description}` : i.description,
        imei: i.device?.imei ?? null,
        startDate: start,
        endDate: warrantyUntil(start, i.warrantyDays),
      },
    });
  }
}

/** Venda cancelada ou devolvida: as garantias dela deixam de valer. */
export async function cancelSaleWarranties(tx: Tx, saleId: string) {
  await tx.warranty.updateMany({ where: { saleId, status: "ATIVA" }, data: { status: "CANCELADA" } });
}

/** OS de cliente entregue: garantia do serviço (prazo "Serviço" em Configurações → Garantias). */
export async function createServiceOrderWarranty(tx: Tx, soId: string) {
  const o = await tx.serviceOrder.findUniqueOrThrow({ where: { id: soId }, include: { warranty: true, device: { include: { model: true } }, model: true } });
  if (o.warranty || o.kind !== "CLIENTE") return;
  const days = (await getWarrantyDays(tx)).SERVICO?.days ?? 90;
  if (days <= 0) return;
  const start = o.deliveredAt ?? new Date();
  const aparelho = o.device ? `${o.device.model.name} ${o.device.capacity}` : (o.deviceDescription ?? "aparelho");
  await tx.warranty.create({
    data: {
      number: await nextSequence(tx, "WARRANTY"),
      kind: "OS",
      customerId: o.customerId,
      serviceOrderId: o.id,
      deviceId: o.deviceId,
      description: `Serviço OS #${o.number} — ${o.services || o.problem} (${aparelho})`,
      imei: o.imei,
      startDate: start,
      endDate: warrantyUntil(start, days),
    },
  });
}

/** OS de garantia entregue: o acionamento é concluído. */
export async function completeClaimForServiceOrder(tx: Tx, soId: string) {
  await tx.warrantyClaim.updateMany({ where: { serviceOrderId: soId, status: "APROVADO" }, data: { status: "CONCLUIDO" } });
}
