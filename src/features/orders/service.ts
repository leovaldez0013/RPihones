// Encomendas: pedido do cliente por um aparelho que a loja ainda não tem.
import type { z } from "zod";
import type { Tx } from "@/lib/db";
import { nextSequence } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { formatBRL } from "@/domain/money";
import { ORDER_STATUS, PAYMENT_METHOD } from "@/domain/constants";
import { addDeviceEvent } from "@/features/devices/service";
import { createEntry, defaultAccountId, registerReceipt } from "@/features/finance/service";
import { generateOrderDoc } from "@/features/documents/service";
import type { arrivalSchema, deliverOrderSchema, orderSchema } from "./schemas";
import { createDevice } from "@/features/devices/service";
import { saveSale } from "@/features/sales/service";
import { saleSchema } from "@/features/sales/schemas";
import { imeiText } from "@/lib/format";

type OrderData = z.output<typeof orderSchema>;

export async function saveOrder(tx: Tx, data: OrderData, userId: string) {
  const model = await tx.deviceModel.findUniqueOrThrow({ where: { id: data.modelId } });
  if (data.minPrice && data.maxPrice && data.minPrice > data.maxPrice) throw new BusinessError("Preço mínimo maior que o máximo.");
  const fields = {
    customerId: data.customerId,
    modelId: model.id,
    modelName: model.name,
    capacity: data.capacity,
    color: data.color,
    condition: data.condition,
    minPrice: data.minPrice,
    maxPrice: data.maxPrice,
    agreedPrice: data.agreedPrice,
    dueDate: data.dueDate,
    notes: data.notes,
  };
  if (data.id) {
    const before = await tx.order.findUniqueOrThrow({ where: { id: data.id } });
    if (["ENTREGUE", "CANCELADA"].includes(before.status)) throw new BusinessError("Encomenda finalizada não pode ser alterada.");
    const o = await tx.order.update({ where: { id: data.id }, data: fields });
    await audit(tx, { userId, action: "order.update", entity: "Order", entityId: o.id, summary: `Encomenda #${o.number} atualizada` });
    return o;
  }
  if (data.deposit > 0 && !data.depositMethod) throw new BusinessError("Informe a forma de pagamento do sinal.");
  const number = await nextSequence(tx, "ORDER");
  const o = await tx.order.create({ data: { ...fields, number, deposit: data.deposit, depositMethod: data.deposit > 0 ? data.depositMethod : null, createdById: userId } });
  if (data.deposit > 0) await registerReceipt(tx, { description: `Sinal da encomenda #${number} (${PAYMENT_METHOD.label(data.depositMethod!)})`, amount: data.deposit, method: data.depositMethod!, categoryKey: "SINAL", customerId: data.customerId, originType: "ENCOMENDA", originId: o.id, userId });
  await generateOrderDoc(tx, o.id, userId);
  await audit(tx, { userId, action: "order.create", entity: "Order", entityId: o.id, summary: `Encomenda #${number}: ${model.name}${data.deposit ? ` — sinal ${formatBRL(data.deposit)}` : ""}` });
  // pode já existir aparelho compatível em estoque
  await notifyMatchesForOrder(tx, o.id);
  return o;
}

export async function setOrderStatus(tx: Tx, id: string, status: string, userId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id } });
  if (["ENTREGUE", "CANCELADA"].includes(o.status)) throw new BusinessError("Encomenda já finalizada.");
  if (status === "ENTREGUE") throw new BusinessError("A entrega é registrada pela venda (botão “Vender e entregar”).");
  if (status === "CANCELADA") throw new BusinessError("Use a opção Cancelar encomenda.");
  await tx.order.update({ where: { id }, data: { status } });
  await audit(tx, { userId, action: "order.status", entity: "Order", entityId: id, summary: `Encomenda #${o.number}: ${ORDER_STATUS.label(o.status)} → ${ORDER_STATUS.label(status)}` });
}

/** Critérios de compatibilidade aparelho × encomenda. */
export function matchesOrder(
  o: { modelId: string | null; modelName: string; capacity: string | null; color: string | null; condition: string | null; maxPrice: number | null },
  d: { modelId: string; capacity: string; color: string; condition: string; salePrice: number; model?: { name: string } },
) {
  if (o.modelId ? o.modelId !== d.modelId : o.modelName !== d.model?.name) return false;
  if (o.capacity && o.capacity !== d.capacity) return false;
  if (o.color && o.color !== d.color) return false;
  if (o.condition && o.condition !== d.condition) return false;
  if (o.maxPrice && d.salePrice > o.maxPrice) return false;
  return true;
}

export async function compatibleDevices(tx: Tx, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const devices = await tx.device.findMany({
    where: { deletedAt: null, status: "DISPONIVEL", modelId: o.modelId ?? undefined },
    include: { model: true },
    orderBy: { salePrice: "asc" },
  });
  return devices.filter((d) => matchesOrder(o, d));
}

async function notifyMatchesForOrder(tx: Tx, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true } });
  const matches = await compatibleDevices(tx, orderId);
  if (!matches.length) return;
  await tx.notification.create({
    data: {
      type: "ORDER_MATCH",
      title: `Já há ${matches.length} aparelho(s) para a encomenda #${o.number}`,
      body: `${o.customer.name} — ${o.modelName}${o.capacity ? ` ${o.capacity}` : ""}. Reserve na encomenda.`,
      href: `/encomendas/${o.id}`,
    },
  });
}

/** Chamado quando um aparelho fica disponível (compra, troca, OS concluída, devolução). */
export async function notifyMatchingOrders(tx: Tx, deviceId: string) {
  const d = await tx.device.findUnique({ where: { id: deviceId }, include: { model: true } });
  if (!d || d.status !== "DISPONIVEL") return;
  const orders = await tx.order.findMany({ where: { deletedAt: null, status: { in: ["ABERTA", "EM_BUSCA"] }, deviceId: null }, include: { customer: true } });
  for (const o of orders.filter((x) => matchesOrder(x, d))) {
    await tx.notification.create({
      data: {
        type: "ORDER_MATCH",
        title: `Chegou aparelho para a encomenda #${o.number}`,
        body: `${d.model.name} ${d.capacity} ${d.color} (${formatBRL(d.salePrice)}) combina com o pedido de ${o.customer.name}.`,
        href: `/encomendas/${o.id}`,
      },
    });
  }
}

export async function reserveForOrder(tx: Tx, orderId: string, deviceId: string, userId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (["ENTREGUE", "CANCELADA"].includes(o.status)) throw new BusinessError("Encomenda finalizada.");
  const d = await tx.device.findUniqueOrThrow({ where: { id: deviceId }, include: { model: true } });
  if (d.status !== "DISPONIVEL") throw new BusinessError("O aparelho não está disponível para reserva.");
  if (o.deviceId) await releaseOrderDevice(tx, orderId, userId);
  await tx.device.update({ where: { id: d.id }, data: { status: "RESERVADO", reservedForOrderId: o.id, reservedCustomerId: o.customerId } });
  await tx.order.update({ where: { id: o.id }, data: { deviceId: d.id, status: o.status === "CLIENTE_AVISADO" ? o.status : "CHEGOU" } });
  await addDeviceEvent(tx, { deviceId: d.id, type: "RESERVA", description: `Reservado para a encomenda #${o.number}`, userId, refType: "ENCOMENDA", refId: o.id });
  await audit(tx, { userId, action: "order.reserve", entity: "Order", entityId: o.id, summary: `Encomenda #${o.number}: reservado ${d.model.name} ${imeiText(d.imei)}` });
}

export async function releaseOrderDevice(tx: Tx, orderId: string, userId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!o.deviceId) return;
  const d = await tx.device.findUnique({ where: { id: o.deviceId } });
  if (d && d.status === "RESERVADO" && d.reservedForOrderId === o.id) {
    await tx.device.update({ where: { id: d.id }, data: { status: "DISPONIVEL", reservedForOrderId: null, reservedCustomerId: null } });
    await addDeviceEvent(tx, { deviceId: d.id, type: "RESERVA", description: `Reserva da encomenda #${o.number} liberada`, userId, refType: "ENCOMENDA", refId: o.id });
  }
  await tx.order.update({ where: { id: o.id }, data: { deviceId: null, status: ["CHEGOU", "CLIENTE_AVISADO"].includes(o.status) ? "EM_BUSCA" : o.status } });
}

export async function cancelOrder(tx: Tx, input: { id: string; reason: string; refund: boolean }, userId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: input.id } });
  if (["ENTREGUE", "CANCELADA"].includes(o.status)) throw new BusinessError("Encomenda já finalizada.");
  await releaseOrderDevice(tx, o.id, userId);
  if (input.refund && o.deposit > 0) {
    await createEntry(tx, {
      type: "PAGAR",
      description: `Devolução do sinal — encomenda #${o.number}`,
      amount: o.deposit,
      dueDate: new Date(),
      paid: true,
      categoryKey: "SINAL",
      accountId: await defaultAccountId(tx, o.depositMethod === "DINHEIRO" ? "CAIXA" : "BANCO"),
      method: o.depositMethod === "DINHEIRO" ? "DINHEIRO" : "PIX",
      customerId: o.customerId,
      originType: "ENCOMENDA",
      originId: o.id,
      notes: input.reason,
      userId,
    });
  }
  await tx.order.update({ where: { id: o.id }, data: { status: "CANCELADA", notes: `${o.notes ? `${o.notes}\n` : ""}Cancelada: ${input.reason}${o.deposit ? (input.refund ? " (sinal devolvido)" : " (sinal retido)") : ""}` } });
  await audit(tx, { userId, action: "order.cancel", entity: "Order", entityId: o.id, summary: `Encomenda #${o.number} cancelada: ${input.reason}` });
}

/** Chegada do aparelho encomendado: entra no estoque já reservado para o cliente da encomenda. */
export async function registerArrival(tx: Tx, input: z.output<typeof arrivalSchema>, userId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
  if (!["ABERTA", "EM_BUSCA"].includes(o.status) || o.deviceId) throw new BusinessError("Esta encomenda já tem aparelho ou foi finalizada.");
  if (!o.modelId) throw new BusinessError("Encomenda sem modelo do catálogo.");
  const device = await createDevice(
    tx,
    {
      imei: input.imei,
      imei2: null,
      serial: null,
      modelId: o.modelId,
      capacity: input.capacity,
      color: input.color,
      condition: input.condition,
      batteryHealth: input.batteryHealth ?? (input.condition === "NOVO" ? 100 : null),
      grade: input.condition === "NOVO" ? "A+" : "A",
      notes: `Chegou para a encomenda #${o.number}`,
      photos: [],
      supplierId: null,
      acquisitionCost: input.acquisitionCost,
      salePrice: input.salePrice,
      entryDate: new Date(),
      appleWarrantyUntil: null,
      status: "DISPONIVEL",
    },
    { userId, origin: "COMPRA", refType: "ENCOMENDA", refId: o.id, eventDescription: `Entrada para a encomenda #${o.number}` },
  );
  await reserveForOrder(tx, o.id, device.id, userId);
  return device;
}

/** Entrega: vira venda automaticamente (preço combinado, sinal abatido, restante na forma escolhida). */
export async function deliverOrder(tx: Tx, input: z.output<typeof deliverOrderSchema>, actor: { id: string; role: string }) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
  if (!o.deviceId || !["CHEGOU", "CLIENTE_AVISADO"].includes(o.status)) throw new BusinessError("Registre a chegada do aparelho antes de entregar.");
  const d = await tx.device.findUniqueOrThrow({ where: { id: o.deviceId } });
  const price = o.agreedPrice ?? d.salePrice;
  const discount = Math.max(0, d.salePrice - price);
  const total = d.salePrice - discount;
  const rest = total - o.deposit;
  if (rest < 0) throw new BusinessError("O sinal é maior que o valor combinado. Ajuste a encomenda.");
  const payments = [
    ...(o.deposit > 0 ? [{ method: "SINAL" as const, amount: o.deposit }] : []),
    ...(rest > 0 ? [{ method: input.method, amount: rest, installments: input.method === "CREDITO_PARCELADO" ? Math.max(2, input.installments) : 1 }] : []),
  ];
  const data = saleSchema.parse({
    action: "CONCLUIR",
    customerId: o.customerId,
    orderId: o.id,
    items: [{ kind: "DEVICE", deviceId: d.id, discount }],
    payments,
    notes: `Entrega da encomenda #${o.number}`,
  });
  // desconto do valor combinado segue o limite do perfil (acima dele, a venda pede aprovação do gerente)
  return saveSale(tx, data, actor);
}
