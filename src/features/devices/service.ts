// Regras de negócio do estoque de aparelhos. Funções recebem `tx` para rodar dentro de transações.
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { BusinessError } from "@/lib/errors";
import { formatBRL } from "@/domain/money";
import { DEVICE_STATUS } from "@/domain/constants";
import type { DeviceData } from "./schemas";

export async function addDeviceEvent(
  tx: Tx,
  e: { deviceId: string; type: string; description: string; userId?: string | null; refType?: string; refId?: string },
) {
  await tx.deviceEvent.create({
    data: {
      deviceId: e.deviceId,
      type: e.type,
      description: e.description,
      userId: e.userId ?? null,
      refType: e.refType,
      refId: e.refId,
    },
  });
}

/** Garante que o IMEI (e IMEI 2) não exista em nenhum aparelho do estoque. */
export async function assertImeiAvailable(tx: Tx, imei: string, imei2?: string | null, ignoreId?: string) {
  const values = [imei, imei2].filter(Boolean) as string[];
  const existing = await tx.device.findFirst({
    where: {
      id: ignoreId ? { not: ignoreId } : undefined,
      OR: [{ imei: { in: values } }, { imei2: { in: values } }],
    },
    include: { model: true },
  });
  if (existing) {
    throw new BusinessError(
      `IMEI já cadastrado: ${existing.model.name} (${DEVICE_STATUS.label(existing.status)})${existing.deletedAt ? " — registro excluído" : ""}.`,
    );
  }
}

/** Aprende o TAC (8 primeiros dígitos) → modelo a partir dos aparelhos cadastrados. */
export async function learnTac(tx: Tx, imei: string, modelId: string) {
  const tac = imei.slice(0, 8);
  const exists = await tx.tacEntry.findUnique({ where: { tac } });
  if (!exists) await tx.tacEntry.create({ data: { tac, modelId, note: "Aprendido no cadastro" } });
}

export async function createDevice(
  tx: Tx,
  data: DeviceData,
  ctx: {
    userId: string;
    origin?: string;
    eventDescription?: string;
    refType?: string;
    refId?: string;
    purchaseItemId?: string;
    eventType?: string;
  },
) {
  await assertImeiAvailable(tx, data.imei, data.imei2);
  const model = await tx.deviceModel.findUniqueOrThrow({ where: { id: data.modelId } });
  const { id: _id, photos, entryDate, ...rest } = data;
  void _id;
  const device = await tx.device.create({
    data: {
      ...rest,
      photos: JSON.stringify(photos ?? []),
      entryDate: entryDate ?? new Date(),
      origin: ctx.origin ?? "AJUSTE",
      purchaseItemId: ctx.purchaseItemId,
    },
  });
  await learnTac(tx, data.imei, data.modelId);
  // testes de IMEI feitos antes do cadastro (ex.: na avaliação da troca) passam a constar no aparelho
  await tx.imeiCheck.updateMany({ where: { imei: data.imei, deviceId: null }, data: { deviceId: device.id } });
  await addDeviceEvent(tx, {
    deviceId: device.id,
    type: ctx.eventType ?? "ENTRADA",
    description: ctx.eventDescription ?? `Entrada no estoque — custo ${formatBRL(data.acquisitionCost)}`,
    userId: ctx.userId,
    refType: ctx.refType,
    refId: ctx.refId,
  });
  await audit(tx, {
    userId: ctx.userId,
    action: "device.create",
    entity: "Device",
    entityId: device.id,
    summary: `Entrada de ${model.name} ${data.capacity} — IMEI ${data.imei}`,
  });
  return device;
}

export async function updateDevice(tx: Tx, id: string, data: DeviceData, userId: string) {
  const before = await tx.device.findUniqueOrThrow({ where: { id } });
  if (before.deletedAt) throw new BusinessError("Aparelho excluído.");
  if (before.imei !== data.imei || before.imei2 !== data.imei2) {
    if (before.status === "VENDIDO") throw new BusinessError("Não é possível alterar o IMEI de um aparelho vendido.");
    await assertImeiAvailable(tx, data.imei, data.imei2, id);
  }
  // status de venda/reserva/manutenção são controlados pelos fluxos (venda, encomenda, OS)
  const lockedStatus = ["VENDIDO", "RESERVADO", "EM_MANUTENCAO"];
  if (before.status !== data.status && (lockedStatus.includes(before.status) || lockedStatus.includes(data.status))) {
    throw new BusinessError(
      `O status "${DEVICE_STATUS.label(before.status)}" → "${DEVICE_STATUS.label(data.status)}" é controlado pela venda, reserva ou OS.`,
    );
  }

  const { id: _id, photos, entryDate, ...rest } = data;
  void _id;
  const device = await tx.device.update({
    where: { id },
    data: { ...rest, photos: JSON.stringify(photos ?? []), entryDate: entryDate ?? before.entryDate },
  });

  if (before.salePrice !== data.salePrice) {
    await addDeviceEvent(tx, {
      deviceId: id,
      type: "PRECO",
      description: `Preço alterado de ${formatBRL(before.salePrice)} para ${formatBRL(data.salePrice)}`,
      userId,
    });
    await audit(tx, {
      userId,
      action: "device.price_change",
      entity: "Device",
      entityId: id,
      summary: `Preço ${before.imei}: ${formatBRL(before.salePrice)} → ${formatBRL(data.salePrice)}`,
      before: { salePrice: before.salePrice },
      after: { salePrice: data.salePrice },
    });
  }
  if (before.acquisitionCost !== data.acquisitionCost) {
    await audit(tx, {
      userId,
      action: "device.cost_change",
      entity: "Device",
      entityId: id,
      summary: `Custo ${before.imei}: ${formatBRL(before.acquisitionCost)} → ${formatBRL(data.acquisitionCost)}`,
      before: { acquisitionCost: before.acquisitionCost },
      after: { acquisitionCost: data.acquisitionCost },
    });
  }
  if (before.status !== data.status) {
    await addDeviceEvent(tx, {
      deviceId: id,
      type: "AJUSTE",
      description: `Status: ${DEVICE_STATUS.label(before.status)} → ${DEVICE_STATUS.label(data.status)}`,
      userId,
    });
  }
  await audit(tx, { userId, action: "device.update", entity: "Device", entityId: id, summary: `Aparelho ${before.imei} atualizado` });
  return device;
}

/** Custo real = custo de aquisição + custos de OS internas. */
export function realCost(d: { acquisitionCost: number; serviceCost: number }) {
  return d.acquisitionCost + d.serviceCost;
}
