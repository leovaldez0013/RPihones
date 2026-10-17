"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action } from "@/lib/safe-action";
import { soCancelSchema, soCreateSchema, soDeliverSchema, soMoveSchema, soPartSchema, soUpdateSchema } from "./schemas";
import { addPart, cancelServiceOrder, createServiceOrder, deliverServiceOrder, moveServiceOrder, removePart, updateServiceOrder } from "./service";

const refresh = (id?: string) => {
  revalidatePath("/os");
  if (id) revalidatePath(`/os/${id}`);
  revalidatePath("/estoque/aparelhos");
};

const perm = "serviceOrders.edit" as const;

export const createServiceOrderAction = action({ schema: soCreateSchema, permission: perm }, async (data, { user }) => {
  const o = await db.$transaction((tx) => createServiceOrder(tx, data, user.id));
  refresh(o.id);
  return { id: o.id, number: o.number };
});

export const updateServiceOrderAction = action({ schema: soUpdateSchema, permission: perm }, async (data, { user }) => {
  await db.$transaction((tx) => updateServiceOrder(tx, data, user.id));
  refresh(data.id);
  return true;
});

export const moveServiceOrderAction = action({ schema: soMoveSchema, permission: perm }, async (input, { user }) => {
  await db.$transaction((tx) => moveServiceOrder(tx, input, user.id));
  refresh(input.id);
  return true;
});

export const addPartAction = action({ schema: soPartSchema, permission: perm }, async (input, { user }) => {
  await db.$transaction((tx) => addPart(tx, input, user.id));
  refresh(input.serviceOrderId);
  return true;
});

export const removePartAction = action({ schema: z.object({ partId: z.string(), serviceOrderId: z.string() }), permission: perm }, async (input, { user }) => {
  await db.$transaction((tx) => removePart(tx, input.partId, user.id));
  refresh(input.serviceOrderId);
  return true;
});

export const deliverServiceOrderAction = action({ schema: soDeliverSchema, permission: perm }, async (input, { user }) => {
  const r = await db.$transaction((tx) => deliverServiceOrder(tx, input, user.id));
  refresh(input.id);
  revalidatePath("/financeiro");
  return r;
});

export const cancelServiceOrderAction = action({ schema: soCancelSchema, permission: perm }, async (input, { user }) => {
  await db.$transaction((tx) => cancelServiceOrder(tx, input, user.id));
  refresh(input.id);
  return true;
});
