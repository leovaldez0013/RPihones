"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { audit } from "@/lib/audit";
import { validateImei } from "@/domain/imei";
import { deviceSchema, modelSchema, tacSchema } from "./schemas";
import { addDeviceEvent, createDevice, updateDevice } from "./service";

export const saveDevice = action({ schema: deviceSchema, permission: "devices.edit" }, async (data, { user }) => {
  const device = await db.$transaction(async (tx) =>
    data.id ? updateDevice(tx, data.id, data, user.id) : createDevice(tx, data, { userId: user.id, origin: "AJUSTE", checkTac: true }),
  );
  revalidatePath("/estoque/aparelhos");
  return { id: device.id };
});

export const deleteDevice = action(
  { schema: z.object({ id: z.string(), reason: z.string().min(3, "Informe o motivo") }), permission: "devices.edit" },
  async ({ id, reason }, { user }) => {
    await db.$transaction(async (tx) => {
      const d = await tx.device.findUniqueOrThrow({ where: { id } });
      if (["VENDIDO", "RESERVADO", "EM_MANUTENCAO"].includes(d.status)) {
        throw new BusinessError("Aparelho vendido, reservado ou em manutenção não pode ser excluído.");
      }
      await tx.device.update({ where: { id }, data: { deletedAt: new Date() } });
      await addDeviceEvent(tx, { deviceId: id, type: "AJUSTE", description: `Excluído do estoque: ${reason}`, userId: user.id });
      await audit(tx, { userId: user.id, action: "device.delete", entity: "Device", entityId: id, summary: `Aparelho ${d.imei} excluído: ${reason}` });
    });
    revalidatePath("/estoque/aparelhos");
    return true;
  },
);

/** Consulta rápida para o formulário: valida IMEI, sugere modelo pelo TAC e avisa se já existe. */
export const lookupImei = action({ schema: z.object({ imei: z.string() }) }, async ({ imei }) => {
  const v = validateImei(imei);
  const [tac, existing] = await Promise.all([
    v.tac && v.tac.length === 8 ? db.tacEntry.findUnique({ where: { tac: v.tac }, include: { model: true } }) : null,
    v.formatOk
      ? db.device.findFirst({ where: { OR: [{ imei: v.imei }, { imei2: v.imei }] }, include: { model: true } })
      : null,
  ]);
  return {
    ...v,
    tacModel: tac ? { id: tac.modelId, name: tac.model.name } : null,
    existing: existing ? { id: existing.id, name: existing.model.name, status: existing.status, deleted: !!existing.deletedAt } : null,
  };
});

export const saveModel = action({ schema: modelSchema, permission: "catalog.edit" }, async (input, { user }) => {
  const data = { ...input, colors: JSON.stringify(input.colors), capacities: JSON.stringify(input.capacities) };
  const { id, ...rest } = data;
  const saved = await db.$transaction(async (tx) => {
    const m = id ? await tx.deviceModel.update({ where: { id }, data: rest }) : await tx.deviceModel.create({ data: rest });
    await audit(tx, { userId: user.id, action: id ? "model.update" : "model.create", entity: "DeviceModel", entityId: m.id, summary: `Modelo ${m.name}` });
    return m;
  });
  revalidatePath("/configuracoes/catalogo");
  return { id: saved.id };
});

export const saveTac = action({ schema: tacSchema, permission: "catalog.edit" }, async (input) => {
  await db.tacEntry.upsert({ where: { tac: input.tac }, create: input, update: { modelId: input.modelId, note: input.note } });
  revalidatePath("/configuracoes/catalogo");
  return true;
});

export const removeTac = action({ schema: z.object({ tac: z.string() }), permission: "catalog.edit" }, async ({ tac }) => {
  await db.tacEntry.delete({ where: { tac } });
  revalidatePath("/configuracoes/catalogo");
  return true;
});
