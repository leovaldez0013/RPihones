import { z } from "zod";
import { DEVICE_CONDITION, ORDER_STATUS } from "@/domain/constants";
import { optionalString, zCents, zDate } from "@/lib/validators";

export const orderSchema = z.object({
  id: z.string().optional(),
  customerId: z.string().min(1, "Selecione o cliente"),
  modelId: z.string().min(1, "Selecione o modelo"),
  capacity: optionalString,
  color: optionalString,
  condition: z.union([z.enum(DEVICE_CONDITION.values), z.literal("")]).optional().nullable().transform((v) => v || null),
  minPrice: zCents.optional().nullable().transform((v) => v || null),
  maxPrice: zCents.optional().nullable().transform((v) => v || null),
  deposit: zCents.default(0),
  depositMethod: z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO"]).optional().nullable(),
  dueDate: zDate,
  notes: optionalString,
});
export type OrderInput = z.input<typeof orderSchema>;

export const orderStatusSchema = z.object({ id: z.string(), status: z.enum(ORDER_STATUS.values) });
export const reserveSchema = z.object({ orderId: z.string(), deviceId: z.string() });
export const cancelOrderSchema = z.object({ id: z.string(), reason: z.string().trim().min(3), refund: z.boolean() });
