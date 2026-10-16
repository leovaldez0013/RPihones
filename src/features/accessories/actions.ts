"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { audit, diff } from "@/lib/audit";
import { formatBRL } from "@/domain/money";
import { accessorySchema, movementSchema } from "./schemas";
import { moveAccessory } from "./service";

export const saveAccessory = action({ schema: accessorySchema, permission: "accessories.edit" }, async (input, { user }) => {
  const { id, initialQty, compatibility, ...rest } = input;
  const data = { ...rest, compatibility: JSON.stringify(compatibility) };
  const saved = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.accessory.findUniqueOrThrow({ where: { id } });
      const a = await tx.accessory.update({ where: { id }, data });
      const d = diff(before as unknown as Record<string, unknown>, data);
      if (d.changed)
        await audit(tx, {
          userId: user.id,
          action: before.price !== a.price ? "accessory.price_change" : "accessory.update",
          entity: "Accessory",
          entityId: id,
          summary:
            before.price !== a.price
              ? `Preço ${a.name}: ${formatBRL(before.price)} → ${formatBRL(a.price)}`
              : `Acessório ${a.name} atualizado`,
          before: d.before,
          after: d.after,
        });
      return a;
    }
    const a = await tx.accessory.create({ data });
    if (initialQty && initialQty > 0) {
      await moveAccessory(tx, {
        accessoryId: a.id,
        type: "ENTRADA",
        delta: initialQty,
        unitCost: a.cost,
        reason: "Estoque inicial",
        refType: "MANUAL",
        userId: user.id,
      });
    }
    await audit(tx, { userId: user.id, action: "accessory.create", entity: "Accessory", entityId: a.id, summary: `Acessório ${a.name} criado` });
    return a;
  });
  revalidatePath("/estoque/acessorios");
  return { id: saved.id };
});

export const moveStock = action({ schema: movementSchema, permission: "accessories.move" }, async (m, { user }) => {
  await db.$transaction(async (tx) => {
    const acc = await tx.accessory.findUniqueOrThrow({ where: { id: m.accessoryId } });
    let delta: number;
    if (m.type === "AJUSTE") delta = m.quantity - acc.quantity;
    else if (m.type === "ENTRADA") delta = m.quantity;
    else delta = -m.quantity;
    if (delta === 0) throw new BusinessError("Nenhuma alteração de quantidade.");
    await moveAccessory(tx, {
      accessoryId: m.accessoryId,
      type: m.type,
      delta,
      unitCost: m.unitCost,
      reason: m.reason,
      refType: "MANUAL",
      userId: user.id,
    });
    await audit(tx, {
      userId: user.id,
      action: "accessory.move",
      entity: "Accessory",
      entityId: acc.id,
      summary: `${m.type} de ${Math.abs(delta)} un. — ${acc.name}: ${m.reason}`,
    });
  });
  revalidatePath("/estoque/acessorios");
  return true;
});

export const deleteAccessory = action(
  { schema: z.object({ id: z.string() }), permission: "accessories.edit" },
  async ({ id }, { user }) => {
    await db.$transaction(async (tx) => {
      const a = await tx.accessory.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
      await audit(tx, { userId: user.id, action: "accessory.delete", entity: "Accessory", entityId: id, summary: `Acessório ${a.name} excluído` });
    });
    revalidatePath("/estoque/acessorios");
    return true;
  },
);

export const getMovements = action(
  { schema: z.object({ accessoryId: z.string() }), permission: "accessories.view" },
  async ({ accessoryId }) => {
    const rows = await db.stockMovement.findMany({
      where: { accessoryId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: true },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      quantity: r.quantity,
      reason: r.reason,
      refType: r.refType,
      refId: r.refId,
      user: r.user?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  },
);
