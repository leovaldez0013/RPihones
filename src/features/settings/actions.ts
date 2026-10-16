"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { audit, diff } from "@/lib/audit";
import { operationalSchema, storeSchema, userSchema } from "./schemas";

export const saveStoreSettings = action({ schema: storeSchema, permission: "settings.store" }, async (input, { user }) => {
  const before = await db.storeSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  const d = diff(before as unknown as Record<string, unknown>, input);
  await db.$transaction(async (tx) => {
    await tx.storeSettings.update({ where: { id: "default" }, data: input });
    if (d.changed)
      await audit(tx, {
        userId: user.id,
        action: "settings.store",
        entity: "StoreSettings",
        entityId: "default",
        summary: "Dados da loja atualizados",
        before: d.before,
        after: d.after,
      });
  });
  revalidatePath("/", "layout");
  return true;
});

export const saveOperationalSettings = action(
  { schema: operationalSchema, permission: "settings.operational" },
  async (input, { user }) => {
    await db.$transaction(async (tx) => {
      await tx.storeSettings.update({ where: { id: "default" }, data: input });
      await audit(tx, { userId: user.id, action: "settings.operational", entity: "StoreSettings", after: input });
    });
    revalidatePath("/configuracoes");
    return true;
  },
);

export const saveUser = action({ schema: userSchema, permission: "settings.users" }, async (input, { user }) => {
  const { id, password, ...data } = input;
  if (!id && !password) throw new BusinessError("Defina uma senha inicial para o novo usuário.");
  if (id === user.id && (data.role !== "ADMIN" || !data.active)) {
    throw new BusinessError("Você não pode remover seu próprio acesso de administrador.");
  }
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  const saved = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      const u = await tx.user.update({ where: { id }, data: { ...data, ...(passwordHash ? { passwordHash } : {}) } });
      const d = diff(before as unknown as Record<string, unknown>, data);
      if (d.changed || passwordHash) await audit(tx, {
        userId: user.id,
        action: "user.update",
        entity: "User",
        entityId: id,
        summary: `Usuário ${u.name} atualizado${passwordHash ? " (senha redefinida)" : ""}`,
        before: d.before,
        after: d.after,
      });
      return u;
    }
    const u = await tx.user.create({ data: { ...data, passwordHash: passwordHash! } });
    await audit(tx, { userId: user.id, action: "user.create", entity: "User", entityId: u.id, summary: `Usuário ${u.name} criado`, after: data });
    return u;
  });
  revalidatePath("/configuracoes/usuarios");
  return { id: saved.id };
});
