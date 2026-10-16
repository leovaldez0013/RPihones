"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action } from "@/lib/safe-action";
import { purchaseSchema, receiveSchema, usedPurchaseSchema } from "./schemas";
import { buyUsedDevice, cancelPurchase, placePurchase, receivePurchase, savePurchase } from "./service";

export const savePurchaseAction = action({ schema: purchaseSchema, permission: "purchases.edit" }, async (data, { user }) => {
  const p = await db.$transaction((tx) => savePurchase(tx, data, user.id));
  revalidatePath("/compras");
  return { id: p.id };
});

export const placePurchaseAction = action({ schema: z.object({ id: z.string() }), permission: "purchases.edit" }, async ({ id }, { user }) => {
  await db.$transaction((tx) => placePurchase(tx, id, user.id));
  revalidatePath(`/compras/${id}`);
  return true;
});

export const cancelPurchaseAction = action(
  { schema: z.object({ id: z.string(), reason: z.string().min(3) }), permission: "purchases.edit" },
  async ({ id, reason }, { user }) => {
    await db.$transaction((tx) => cancelPurchase(tx, id, reason, user.id));
    revalidatePath(`/compras/${id}`);
    return true;
  },
);

export const receivePurchaseAction = action({ schema: receiveSchema, permission: "purchases.edit" }, async (data, { user }) => {
  const r = await db.$transaction((tx) => receivePurchase(tx, data, user.id), { timeout: 30000 });
  revalidatePath(`/compras/${data.purchaseId}`);
  revalidatePath("/estoque/aparelhos");
  return r;
});

export const buyUsedDeviceAction = action({ schema: usedPurchaseSchema, permission: "devices.edit" }, async (data, { user }) => {
  const r = await db.$transaction((tx) => buyUsedDevice(tx, data, user.id));
  revalidatePath("/estoque/aparelhos");
  return { deviceId: r.device.id, purchaseId: r.purchase.id, number: r.purchase.number, documentId: r.documentId };
});
