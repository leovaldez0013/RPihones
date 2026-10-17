// Ordens de serviço: preparação interna de aparelhos do estoque e reparos de clientes.
import type { z } from "zod";
import type { Tx } from "@/lib/db";
import { nextSequence } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { formatBRL } from "@/domain/money";
import { DEVICE_STATUS, SO_STATUS } from "@/domain/constants";
import { SO_CLOSED, reorder, soTotals } from "@/domain/service-order";
import { addDeviceEvent } from "@/features/devices/service";
import { moveAccessory } from "@/features/accessories/service";
import { createEntry, registerReceipt } from "@/features/finance/service";
import { generateServiceOrderDoc } from "@/features/documents/service";
import { onDeviceAvailable } from "@/features/orders/matching";
import type { soCreateSchema, soDeliverSchema, soPartSchema, soUpdateSchema } from "./schemas";

/** Status do aparelho de estoque que permitem abrir OS interna. */
const DEVICE_OPENABLE = ["DISPONIVEL", "EM_AVALIACAO", "DEVOLVIDO"];

async function getOpen(tx: Tx, id: string) {
  const o = await tx.serviceOrder.findUniqueOrThrow({ where: { id }, include: { parts: true } });
  if (o.deletedAt || SO_CLOSED.includes(o.status)) {
    throw new BusinessError(`A OS #${o.number} já foi ${o.status === "ENTREGUE" ? "entregue" : "cancelada"}.`);
  }
  return o;
}

async function nextPosition(tx: Tx, status: string) {
  const last = await tx.serviceOrder.findFirst({ where: { status, deletedAt: null }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? -1) + 1;
}

export async function createServiceOrder(tx: Tx, data: z.output<typeof soCreateSchema>, userId: string) {
  let customerId = data.customerId;
  let imei = data.imei;
  if (data.deviceId) {
    const d = await tx.device.findUniqueOrThrow({ where: { id: data.deviceId } });
    if (d.deletedAt) throw new BusinessError("Aparelho excluído.");
    const open = await tx.serviceOrder.findFirst({ where: { deviceId: d.id, deletedAt: null, status: { notIn: SO_CLOSED } } });
    if (open) throw new BusinessError(`Este aparelho já está na OS #${open.number}.`);
    if (data.kind === "INTERNA") {
      if (!DEVICE_OPENABLE.includes(d.status)) {
        throw new BusinessError(`Aparelho com status "${DEVICE_STATUS.label(d.status)}" não pode entrar em OS interna. Libere a reserva ou use uma OS de cliente.`);
      }
      await tx.device.update({ where: { id: d.id }, data: { status: "EM_MANUTENCAO" } });
      customerId = null;
    }
    imei = d.imei;
  }

  const number = await nextSequence(tx, "SO");
  const o = await tx.serviceOrder.create({
    data: {
      number,
      kind: data.kind,
      deviceId: data.deviceId,
      deviceDescription: data.deviceDescription,
      imei,
      customerId,
      technicianId: data.technicianId,
      problem: data.problem,
      services: data.services,
      diagnosis: data.diagnosis,
      laborCost: data.laborCost,
      price: data.kind === "INTERNA" ? 0 : data.price,
      priority: data.priority,
      dueDate: data.dueDate,
      checklist: JSON.stringify(data.checklist),
      photos: JSON.stringify(data.photos),
      position: await nextPosition(tx, "ABERTA"),
      createdById: userId,
    },
  });
  if (data.deviceId) {
    await addDeviceEvent(tx, { deviceId: data.deviceId, type: "OS_ABERTA", description: `OS #${number} aberta: ${data.problem}`, userId, refType: "OS", refId: o.id });
  }
  if (data.kind === "CLIENTE") await generateServiceOrderDoc(tx, o.id, "OS_ENTRADA", userId);
  await audit(tx, { userId, action: "so.create", entity: "ServiceOrder", entityId: o.id, summary: `OS #${number} (${data.kind === "INTERNA" ? "interna" : "cliente"}): ${data.problem}` });
  return o;
}

export async function updateServiceOrder(tx: Tx, data: z.output<typeof soUpdateSchema>, userId: string) {
  const before = await getOpen(tx, data.id);
  const o = await tx.serviceOrder.update({
    where: { id: data.id },
    data: {
      technicianId: data.technicianId,
      problem: data.problem,
      services: data.services,
      diagnosis: data.diagnosis,
      laborCost: data.laborCost,
      price: before.kind === "INTERNA" ? 0 : data.price,
      priority: data.priority,
      dueDate: data.dueDate,
      checklist: JSON.stringify(data.checklist),
      photos: JSON.stringify(data.photos),
    },
  });
  await audit(tx, { userId, action: "so.update", entity: "ServiceOrder", entityId: o.id, summary: `OS #${o.number} atualizada` });
  return o;
}

/** Move o cartão no Kanban (status + posição). Entrega e cancelamento têm fluxo próprio. */
export async function moveServiceOrder(tx: Tx, input: { id: string; status: string; index: number }, userId: string) {
  const o = await getOpen(tx, input.id);
  if (SO_CLOSED.includes(input.status)) throw new BusinessError("Use as opções Entregar ou Cancelar.");
  const column = await tx.serviceOrder.findMany({
    where: { status: input.status, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const ids = reorder(
    column.map((c) => c.id),
    o.id,
    input.index,
  );
  for (const [position, id] of ids.entries()) {
    await tx.serviceOrder.update({ where: { id }, data: id === o.id ? { position, status: input.status } : { position } });
  }
  if (o.status !== input.status) {
    await audit(tx, { userId, action: "so.status", entity: "ServiceOrder", entityId: o.id, summary: `OS #${o.number}: ${SO_STATUS.label(o.status)} → ${SO_STATUS.label(input.status)}` });
  }
}

/** Adiciona peça: baixa imediata do estoque ao custo médio atual. */
export async function addPart(tx: Tx, input: z.output<typeof soPartSchema>, userId: string) {
  const o = await getOpen(tx, input.serviceOrderId);
  const acc = await tx.accessory.findUniqueOrThrow({ where: { id: input.accessoryId } });
  await moveAccessory(tx, { accessoryId: acc.id, type: "SAIDA", delta: -input.quantity, reason: `Peça usada na OS #${o.number}`, refType: "OS", refId: o.id, userId });
  const part = await tx.serviceOrderPart.create({
    data: { serviceOrderId: o.id, accessoryId: acc.id, quantity: input.quantity, unitCost: acc.cost, unitPrice: o.kind === "INTERNA" ? 0 : input.unitPrice },
  });
  await audit(tx, { userId, action: "so.part_add", entity: "ServiceOrder", entityId: o.id, summary: `OS #${o.number}: +${input.quantity}× ${acc.name}` });
  return part;
}

/** Remove peça e devolve ao estoque. */
export async function removePart(tx: Tx, partId: string, userId: string) {
  const part = await tx.serviceOrderPart.findUniqueOrThrow({ where: { id: partId }, include: { accessory: true } });
  const o = await getOpen(tx, part.serviceOrderId);
  await moveAccessory(tx, { accessoryId: part.accessoryId, type: "AJUSTE", delta: part.quantity, reason: `Peça devolvida da OS #${o.number}`, refType: "OS", refId: o.id, userId });
  await tx.serviceOrderPart.delete({ where: { id: part.id } });
  await audit(tx, { userId, action: "so.part_remove", entity: "ServiceOrder", entityId: o.id, summary: `OS #${o.number}: −${part.quantity}× ${part.accessory.name}` });
}

/**
 * Entrega/conclusão.
 * INTERNA: mão de obra + peças somam ao custo real do aparelho, que volta a ficar disponível.
 * CLIENTE: o valor cobrado entra no financeiro (pago ou a receber) e gera o comprovante de entrega.
 */
export async function deliverServiceOrder(tx: Tx, input: z.output<typeof soDeliverSchema>, userId: string) {
  const o = await getOpen(tx, input.id);
  const t = soTotals(o);
  const now = new Date();

  if (o.kind === "INTERNA" && o.deviceId) {
    const d = await tx.device.findUniqueOrThrow({ where: { id: o.deviceId } });
    await tx.device.update({
      where: { id: d.id },
      data: { serviceCost: d.serviceCost + t.cost, status: d.status === "EM_MANUTENCAO" ? "DISPONIVEL" : d.status },
    });
    await addDeviceEvent(tx, { deviceId: d.id, type: "OS_CONCLUIDA", description: `OS #${o.number} concluída — custo ${formatBRL(t.cost)} somado ao aparelho`, userId, refType: "OS", refId: o.id });
  }

  if (o.kind === "CLIENTE" && o.price > 0) {
    const method = input.method ?? "A_RECEBER";
    const description = `OS #${o.number} — serviço`;
    if (method === "A_RECEBER") {
      await createEntry(tx, { type: "RECEBER", description, amount: o.price, dueDate: now, categoryKey: "SERVICO", customerId: o.customerId, originType: "OS", originId: o.id, userId });
    } else {
      await registerReceipt(tx, { description, amount: o.price, method, categoryKey: "SERVICO", customerId: o.customerId, originType: "OS", originId: o.id, userId });
    }
  }
  if (o.kind === "CLIENTE" && o.deviceId) {
    await addDeviceEvent(tx, { deviceId: o.deviceId, type: "OS_CONCLUIDA", description: `OS de cliente #${o.number} entregue`, userId, refType: "OS", refId: o.id });
  }

  await tx.serviceOrder.update({ where: { id: o.id }, data: { status: "ENTREGUE", deliveredAt: now } });
  if (o.kind === "CLIENTE") await generateServiceOrderDoc(tx, o.id, "OS_ENTREGA", userId);
  if (o.kind === "INTERNA" && o.deviceId) await onDeviceAvailable(tx, o.deviceId);
  await audit(tx, {
    userId,
    action: "so.deliver",
    entity: "ServiceOrder",
    entityId: o.id,
    summary: o.kind === "INTERNA" ? `OS #${o.number} concluída — custo ${formatBRL(t.cost)}` : `OS #${o.number} entregue — cobrado ${formatBRL(o.price)}`,
  });
  return t;
}

/** Cancela: peças voltam ao estoque e o aparelho do estoque volta a ficar disponível. */
export async function cancelServiceOrder(tx: Tx, input: { id: string; reason: string }, userId: string) {
  const o = await getOpen(tx, input.id);
  for (const p of o.parts) {
    await moveAccessory(tx, { accessoryId: p.accessoryId, type: "AJUSTE", delta: p.quantity, reason: `OS #${o.number} cancelada`, refType: "OS", refId: o.id, userId });
  }
  await tx.serviceOrderPart.deleteMany({ where: { serviceOrderId: o.id } });
  if (o.kind === "INTERNA" && o.deviceId) {
    const d = await tx.device.findUniqueOrThrow({ where: { id: o.deviceId } });
    if (d.status === "EM_MANUTENCAO") await tx.device.update({ where: { id: d.id }, data: { status: "DISPONIVEL" } });
    await addDeviceEvent(tx, { deviceId: d.id, type: "OS_CONCLUIDA", description: `OS #${o.number} cancelada: ${input.reason}`, userId, refType: "OS", refId: o.id });
  }
  await tx.serviceOrder.update({
    where: { id: o.id },
    data: { status: "CANCELADA", diagnosis: `${o.diagnosis ? `${o.diagnosis}\n` : ""}Cancelada: ${input.reason}` },
  });
  if (o.kind === "INTERNA" && o.deviceId) await onDeviceAvailable(tx, o.deviceId);
  await audit(tx, { userId, action: "so.cancel", entity: "ServiceOrder", entityId: o.id, summary: `OS #${o.number} cancelada: ${input.reason}` });
}
