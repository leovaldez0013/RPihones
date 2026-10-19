"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action } from "@/lib/safe-action";
import { arrivalSchema, cancelOrderSchema, deliverOrderSchema, orderSchema, orderStatusSchema, reserveSchema } from "./schemas";
import { cancelOrder, deliverOrder, registerArrival, releaseOrderDevice, reserveForOrder, saveOrder, setOrderStatus } from "./service";

const refresh = (id?: string) => {
  revalidatePath("/encomendas");
  if (id) revalidatePath(`/encomendas/${id}`);
};

export const saveOrderAction = action({ schema: orderSchema, permission: "orders.edit" }, async (data, { user }) => {
  const o = await db.$transaction((tx) => saveOrder(tx, data, user.id));
  refresh(o.id);
  return { id: o.id, number: o.number };
});

export const setOrderStatusAction = action({ schema: orderStatusSchema, permission: "orders.edit" }, async ({ id, status }, { user }) => {
  await db.$transaction((tx) => setOrderStatus(tx, id, status, user.id));
  refresh(id);
  return true;
});

export const reserveForOrderAction = action({ schema: reserveSchema, permission: "orders.edit" }, async ({ orderId, deviceId }, { user }) => {
  await db.$transaction((tx) => reserveForOrder(tx, orderId, deviceId, user.id));
  refresh(orderId);
  revalidatePath("/estoque/aparelhos");
  return true;
});

export const releaseOrderDeviceAction = action({ schema: z.object({ orderId: z.string() }), permission: "orders.edit" }, async ({ orderId }, { user }) => {
  await db.$transaction((tx) => releaseOrderDevice(tx, orderId, user.id));
  refresh(orderId);
  return true;
});

export const cancelOrderAction = action({ schema: cancelOrderSchema, permission: "orders.edit" }, async (input, { user }) => {
  await db.$transaction((tx) => cancelOrder(tx, input, user.id));
  refresh(input.id);
  return true;
});

export const registerArrivalAction = action({ schema: arrivalSchema, permission: "orders.edit" }, async (input, { user }) => {
  const d = await db.$transaction((tx) => registerArrival(tx, input, user.id));
  refresh(input.orderId);
  revalidatePath("/estoque/aparelhos");
  return { deviceId: d.id };
});

export const deliverOrderAction = action({ schema: deliverOrderSchema, permission: ["orders.edit", "sales.create"] }, async (input, { user }) => {
  const sale = await db.$transaction((tx) => deliverOrder(tx, input, user), { timeout: 20000 });
  refresh(input.orderId);
  revalidatePath("/vendas");
  return { saleId: sale.id, number: sale.number };
});
