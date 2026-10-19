// Regras de negócio do estoque de aparelhos. Funções recebem `tx` para rodar dentro de transações.
import type { Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { BusinessError } from "@/lib/errors";
import { formatBRL } from "@/domain/money";
import { DEVICE_STATUS } from "@/domain/constants";
import type { DeviceData } from "./schemas";
import { imeiText } from "@/lib/format";

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

/** Garante que o IMEI (e IMEI 2) não exista em nenhum aparelho do estoque. Sem IMEI não há o que checar. */
export async function assertImeiAvailable(tx: Tx, imei: string | null | undefined, imei2?: string | null, ignoreId?: string) {
  const values = [imei, imei2].filter(Boolean) as string[];
  if (!values.length) return;
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

/**
 * Divergência TAC × modelo: se os 8 primeiros dígitos já estão ligados a outro modelo, pede confirmação
 * (o formulário reenvia com confirmTacMismatch). Não bloqueia de vez: a tabela pode estar errada.
 */
export async function assertTacMatches(tx: Tx, imei: string | null | undefined, modelId: string, confirmed?: boolean) {
  if (!imei || confirmed) return;
  const known = await tx.tacEntry.findUnique({ where: { tac: imei.slice(0, 8) }, include: { model: true } });
  if (known && known.modelId !== modelId) {
    throw new BusinessError(`Este IMEI costuma ser do ${known.model.name}. Confirma?`, "TAC_MISMATCH");
  }
}

/** Aprende o TAC (8 primeiros dígitos) → modelo a partir dos aparelhos cadastrados (não sobrescreve o que já existe). */
export async function learnTac(tx: Tx, imei: string | null | undefined, modelId: string) {
  if (!imei) return;
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
    /** formulário de cadastro: avisa se o modelo diverge do TAC conhecido */
    checkTac?: boolean;
  },
) {
  await assertImeiAvailable(tx, data.imei, data.imei2);
  if (ctx.checkTac) await assertTacMatches(tx, data.imei, data.modelId, data.confirmTacMismatch);
  const model = await tx.deviceModel.findUniqueOrThrow({ where: { id: data.modelId } });
  const { id: _id, photos, entryDate, confirmTacMismatch: _c, ...rest } = data;
  void _id;
  void _c;
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
  if (data.imei) await tx.imeiCheck.updateMany({ where: { imei: data.imei, deviceId: null }, data: { deviceId: device.id } });
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
    summary: `Entrada de ${model.name} ${data.capacity} — ${imeiText(data.imei)}`,
  });
  return device;
}

export async function updateDevice(tx: Tx, id: string, data: DeviceData, userId: string) {
  const before = await tx.device.findUniqueOrThrow({ where: { id } });
  if (before.deletedAt) throw new BusinessError("Aparelho excluído.");
  if (before.imei !== data.imei || before.imei2 !== data.imei2) {
    // aparelho vendido: só pode receber o IMEI que faltava, não trocar um já informado
    if (before.status === "VENDIDO" && before.imei && before.imei !== data.imei) throw new BusinessError("Não é possível alterar o IMEI de um aparelho vendido.");
    await assertImeiAvailable(tx, data.imei, data.imei2, id);
  }
  if (data.imei && (data.imei !== before.imei || data.modelId !== before.modelId)) {
    await assertTacMatches(tx, data.imei, data.modelId, data.confirmTacMismatch);
  }
  // status de venda/reserva/manutenção são controlados pelos fluxos (venda, encomenda, OS)
  const lockedStatus = ["VENDIDO", "RESERVADO", "EM_MANUTENCAO"];
  if (before.status !== data.status && (lockedStatus.includes(before.status) || lockedStatus.includes(data.status))) {
    throw new BusinessError(
      `O status "${DEVICE_STATUS.label(before.status)}" → "${DEVICE_STATUS.label(data.status)}" é controlado pela venda, reserva ou OS.`,
    );
  }

  const { id: _id, photos, entryDate, confirmTacMismatch: _c, ...rest } = data;
  void _id;
  void _c;
  const device = await tx.device.update({
    where: { id },
    data: { ...rest, photos: JSON.stringify(photos ?? []), entryDate: entryDate ?? before.entryDate },
  });
  if (data.imei && data.imei !== before.imei) {
    await learnTac(tx, data.imei, data.modelId);
    await tx.imeiCheck.updateMany({ where: { imei: data.imei, deviceId: null }, data: { deviceId: id } });
    await addDeviceEvent(tx, { deviceId: id, type: "AJUSTE", description: before.imei ? `IMEI alterado: ${before.imei} → ${data.imei}` : `IMEI informado: ${data.imei}`, userId });
  }

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
