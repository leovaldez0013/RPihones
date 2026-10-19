import { z } from "zod";
import { DEVICE_CONDITION, ORDER_STATUS } from "@/domain/constants";
import { optionalString, zCents, zDate, zOptionalInt } from "@/lib/validators";
import { zImeiOptional } from "@/features/devices/schemas";

export const orderSchema = z.object({
  id: z.string().optional(),
  customerId: z.string().min(1, "Selecione o cliente"),
  modelId: z.string().min(1, "Selecione o modelo"),
  capacity: optionalString,
  color: optionalString,
  condition: z.union([z.enum(DEVICE_CONDITION.values), z.literal("")]).optional().nullable().transform((v) => v || null),
  minPrice: zCents.optional().nullable().transform((v) => v || null),
  maxPrice: zCents.optional().nullable().transform((v) => v || null),
  agreedPrice: zCents.optional().nullable().transform((v) => v || null),
  deposit: zCents.default(0),
  depositMethod: z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO"]).optional().nullable(),
  dueDate: zDate,
  notes: optionalString,
});
export type OrderInput = z.input<typeof orderSchema>;

export const orderStatusSchema = z.object({ id: z.string(), status: z.enum(ORDER_STATUS.values) });
export const reserveSchema = z.object({ orderId: z.string(), deviceId: z.string() });
export const cancelOrderSchema = z.object({ id: z.string(), reason: z.string().trim().min(3), refund: z.boolean() });

export const arrivalSchema = z.object({
  orderId: z.string(),
  imei: zImeiOptional(),
  capacity: z.string().min(1, "Informe a capacidade"),
  color: z.string().min(1, "Informe a cor"),
  condition: z.enum(DEVICE_CONDITION.values),
  batteryHealth: zOptionalInt(0, 100),
  acquisitionCost: zCents,
  salePrice: zCents.refine((v) => v > 0, "Informe o preço de venda"),
});

export const deliverOrderSchema = z.object({
  orderId: z.string(),
  method: z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO", "CREDITO_PARCELADO"]),
  installments: z.coerce.number().int().min(1).max(12).default(1),
});
