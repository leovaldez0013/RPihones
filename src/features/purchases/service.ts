// Regras de compras: pedido → recebimento (parcial ou total) → estoque + contas a pagar.
import type { z } from "zod";
import type { Tx } from "@/lib/db";
import { nextSequence } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { formatBRL } from "@/domain/money";
import { createDevice, addDeviceEvent } from "@/features/devices/service";
import { moveAccessory } from "@/features/accessories/service";
import { createEntry, defaultAccountId } from "@/features/finance/service";
import { onDeviceAvailable } from "@/features/orders/matching";
import { generateUsedPurchaseDoc } from "@/features/documents/service";
import type { purchaseSchema, receiveSchema, usedPurchaseSchema } from "./schemas";

type PurchaseData = z.output<typeof purchaseSchema>;
type ReceiveData = z.output<typeof receiveSchema>;
type UsedData = z.output<typeof usedPurchaseSchema>;

async function describeItem(tx: Tx, it: PurchaseData["items"][number]) {
  if (it.kind === "DEVICE") {
    const m = await tx.deviceModel.findUniqueOrThrow({ where: { id: it.modelId! } });
    return [m.name, it.capacity, it.color].filter(Boolean).join(" ");
  }
  const a = await tx.accessory.findUniqueOrThrow({ where: { id: it.accessoryId! } });
  return a.name;
}

export async function savePurchase(tx: Tx, data: PurchaseData, userId: string) {
  const total = data.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const items = await Promise.all(
    data.items.map(async (it) => ({
      kind: it.kind,
      modelId: it.kind === "DEVICE" ? it.modelId : null,
      capacity: it.kind === "DEVICE" ? it.capacity : null,
      color: it.kind === "DEVICE" ? it.color : null,
      condition: it.kind === "DEVICE" ? (it.condition ?? "SEMINOVO") : null,
      accessoryId: it.kind === "ACCESSORY" ? it.accessoryId : null,
      description: await describeItem(tx, it),
      quantity: it.quantity,
      unitCost: it.unitCost,
      salePrice: it.salePrice,
    })),
  );

  if (data.id) {
    const current = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: data.id } });
    if (current.status !== "RASCUNHO") throw new BusinessError("Só é possível editar pedidos em rascunho.");
    await tx.purchaseItem.deleteMany({ where: { purchaseId: data.id } });
    const p = await tx.purchaseOrder.update({
      where: { id: data.id },
      data: { supplierId: data.supplierId, expectedAt: data.expectedAt, dueDate: data.dueDate, notes: data.notes, total, items: { create: items } },
    });
    await audit(tx, { userId, action: "purchase.update", entity: "PurchaseOrder", entityId: p.id, summary: `Pedido de compra #${p.number} atualizado (${formatBRL(total)})` });
    return p;
  }
  const number = await nextSequence(tx, "PURCHASE");
  const p = await tx.purchaseOrder.create({
    data: {
      number,
      supplierId: data.supplierId,
      expectedAt: data.expectedAt,
      dueDate: data.dueDate,
      notes: data.notes,
      total,
      createdById: userId,
      items: { create: items },
    },
  });
  await audit(tx, { userId, action: "purchase.create", entity: "PurchaseOrder", entityId: p.id, summary: `Pedido de compra #${number} criado (${formatBRL(total)})` });
  return p;
}

export async function placePurchase(tx: Tx, id: string, userId: string) {
  const p = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
  if (p.status !== "RASCUNHO") throw new BusinessError("O pedido já foi enviado.");
  await tx.purchaseOrder.update({ where: { id }, data: { status: "PEDIDO", orderedAt: new Date() } });
  await audit(tx, { userId, action: "purchase.place", entity: "PurchaseOrder", entityId: id, summary: `Pedido #${p.number} enviado ao fornecedor` });
}

export async function cancelPurchase(tx: Tx, id: string, reason: string, userId: string) {
  const p = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
  if (p.items.some((i) => i.receivedQty > 0)) throw new BusinessError("Pedido já teve itens recebidos — não pode ser cancelado.");
  await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELADO", notes: `${p.notes ? `${p.notes}\n` : ""}Cancelado: ${reason}` } });
  await audit(tx, { userId, action: "purchase.cancel", entity: "PurchaseOrder", entityId: id, summary: `Pedido #${p.number} cancelado: ${reason}` });
}

/** Recebe itens: aparelhos entram por IMEI, acessórios por quantidade; gera a conta a pagar do que chegou. */
export async function receivePurchase(tx: Tx, data: ReceiveData, userId: string) {
  const p = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: data.purchaseId }, include: { items: true, supplier: true } });
  if (!["PEDIDO", "RECEBIDO_PARCIAL", "RASCUNHO"].includes(p.status)) throw new BusinessError("Este pedido não pode mais receber itens.");

  let receivedValue = 0;
  let units = 0;
  const seen = new Set<string>();

  for (const r of data.items) {
    const item = p.items.find((i) => i.id === r.itemId);
    if (!item) throw new BusinessError("Item não pertence ao pedido.");
    const remaining = item.quantity - item.receivedQty;
    const qty = item.kind === "DEVICE" ? r.devices.length : r.quantity;
    if (qty === 0) continue;
    if (qty > remaining) throw new BusinessError(`"${item.description}": recebendo ${qty}, mas faltam ${remaining}.`);

    if (item.kind === "DEVICE") {
      for (const d of r.devices) {
        if (d.imei) {
          if (seen.has(d.imei)) throw new BusinessError(`IMEI repetido no recebimento: ${d.imei}`);
          seen.add(d.imei);
        }
        const device = await createDevice(
          tx,
          {
            imei: d.imei,
            imei2: d.imei2 ?? null,
            serial: d.serial ?? null,
            modelId: item.modelId!,
            capacity: item.capacity!,
            color: d.color || item.color || "—",
            condition: (item.condition ?? "SEMINOVO") as "SEMINOVO",
            batteryHealth: d.batteryHealth ?? (item.condition === "NOVO" ? 100 : null),
            grade: (d.grade || (item.condition === "NOVO" ? "A+" : null)) as "A" | null,
            notes: null,
            photos: [],
            supplierId: p.supplierId,
            acquisitionCost: item.unitCost,
            salePrice: item.salePrice,
            entryDate: new Date(),
            appleWarrantyUntil: null,
            status: "DISPONIVEL",
          },
          {
            userId,
            origin: "COMPRA",
            refType: "COMPRA",
            refId: p.id,
            purchaseItemId: item.id,
            eventDescription: `Entrada pela compra #${p.number} — ${p.supplier.name}`,
          },
        );
        await onDeviceAvailable(tx, device.id);
      }
    } else {
      await moveAccessory(tx, {
        accessoryId: item.accessoryId!,
        type: "ENTRADA",
        delta: qty,
        unitCost: item.unitCost,
        reason: `Compra #${p.number} — ${p.supplier.name}`,
        refType: "COMPRA",
        refId: p.id,
        userId,
      });
    }
    await tx.purchaseItem.update({ where: { id: item.id }, data: { receivedQty: { increment: qty } } });
    receivedValue += qty * item.unitCost;
    units += qty;
  }

  if (units === 0) throw new BusinessError("Nenhum item informado para receber.");

  const items = await tx.purchaseItem.findMany({ where: { purchaseId: p.id } });
  const complete = items.every((i) => i.receivedQty >= i.quantity);
  await tx.purchaseOrder.update({ where: { id: p.id }, data: { status: complete ? "RECEBIDO" : "RECEBIDO_PARCIAL", orderedAt: p.orderedAt ?? new Date() } });

  const due = data.dueDate ?? p.dueDate ?? new Date(Date.now() + 30 * 86400000);
  await createEntry(tx, {
    type: "PAGAR",
    description: `Compra #${p.number} — ${p.supplier.name} (${units} ${units === 1 ? "item" : "itens"})`,
    amount: receivedValue,
    dueDate: due,
    paid: data.paid,
    accountId: data.paid ? (data.accountId ?? (await defaultAccountId(tx, "BANCO"))) : (data.accountId ?? null),
    categoryKey: "COMPRA_MERCADORIA",
    supplierId: p.supplierId,
    originType: "COMPRA",
    originId: p.id,
    userId,
  });

  await audit(tx, {
    userId,
    action: "purchase.receive",
    entity: "PurchaseOrder",
    entityId: p.id,
    summary: `Recebimento da compra #${p.number}: ${units} item(ns), ${formatBRL(receivedValue)}${complete ? " — pedido completo" : " — parcial"}`,
  });
  return { units, receivedValue, complete };
}

/** Compra de aparelho de pessoa física (fora de venda). Pagamento sai na hora. */
export async function buyUsedDevice(tx: Tx, data: UsedData, userId: string) {
  const [customer, settings] = await Promise.all([
    tx.customer.findUniqueOrThrow({ where: { id: data.customerId } }),
    tx.storeSettings.findUnique({ where: { id: "default" } }),
  ]);
  const failed = Object.entries(data.checklist).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.includes("icloud")) throw new BusinessError("Aparelho com conta iCloud vinculada não pode ser comprado.");
  if (failed.includes("semBloqueio")) throw new BusinessError("Aparelho com bloqueio/restrição não pode ser comprado.");
  const lastCheck = await tx.imeiCheck.findFirst({ where: { imei: data.imei }, orderBy: { createdAt: "desc" } });
  if (lastCheck?.blacklisted) throw new BusinessError(`O IMEI ${data.imei} consta como BLOQUEADO no teste de IMEI. Não compre este aparelho.`, "IMEI_BLOCKED");

  const status = (settings?.tradeInDefaultStatus ?? "EM_AVALIACAO") as "EM_AVALIACAO" | "DISPONIVEL";
  const device = await createDevice(
    tx,
    {
      imei: data.imei,
      imei2: data.imei2 ?? null,
      serial: data.serial ?? null,
      modelId: data.modelId,
      capacity: data.capacity,
      color: data.color,
      condition: "SEMINOVO",
      batteryHealth: data.batteryHealth ?? null,
      grade: (data.grade || null) as "A" | null,
      notes: [data.notes, failed.length ? `Itens com problema no checklist: ${failed.join(", ")}` : null].filter(Boolean).join("\n") || null,
      photos: data.photos,
      supplierId: null,
      acquisitionCost: data.value,
      salePrice: data.salePrice,
      entryDate: new Date(),
      appleWarrantyUntil: null,
      status,
    },
    { userId, origin: "COMPRA_PF", eventDescription: `Comprado de ${customer.name} (pessoa física) por ${formatBRL(data.value)}` },
  );

  const number = await nextSequence(tx, "USED_PURCHASE");
  const purchase = await tx.usedDevicePurchase.create({
    data: {
      number,
      customerId: customer.id,
      deviceId: device.id,
      value: data.value,
      paymentMethod: data.paymentMethod,
      checklist: JSON.stringify(data.checklist),
      createdById: userId,
    },
  });
  await addDeviceEvent(tx, { deviceId: device.id, type: "ENTRADA", description: `Termo de compra nº ${number} registrado`, userId, refType: "COMPRA_PF", refId: purchase.id });

  const accountId = data.accountId ?? (await defaultAccountId(tx, data.paymentMethod === "DINHEIRO" ? "CAIXA" : "BANCO"));
  await createEntry(tx, {
    type: "PAGAR",
    description: `Compra de aparelho usado nº ${number} — ${customer.name}`,
    amount: data.value,
    dueDate: new Date(),
    paid: true,
    accountId,
    method: data.paymentMethod,
    categoryKey: "COMPRA_USADO",
    customerId: customer.id,
    originType: "COMPRA",
    originId: purchase.id,
    userId,
  });
  await audit(tx, { userId, action: "used_purchase.create", entity: "UsedDevicePurchase", entityId: purchase.id, summary: `Compra de usado nº ${number} de ${customer.name}: ${formatBRL(data.value)}` });
  const doc = await generateUsedPurchaseDoc(tx, purchase.id, userId);
  if (status === "DISPONIVEL") await onDeviceAvailable(tx, device.id);
  return { purchase, device, documentId: doc.id };
}
