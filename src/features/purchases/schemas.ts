import { z } from "zod";
import { DEVICE_CONDITION, GRADES, TRADE_IN_CHECKLIST } from "@/domain/constants";
import { optionalString, zCents, zDate, zOptionalInt } from "@/lib/validators";
import { zImei, zImeiOptional } from "@/features/devices/schemas";

export const purchaseItemSchema = z
  .object({
    id: z.string().optional(),
    kind: z.enum(["DEVICE", "ACCESSORY"]),
    modelId: optionalString,
    capacity: optionalString,
    color: optionalString,
    condition: z.enum(DEVICE_CONDITION.values).optional().nullable(),
    accessoryId: optionalString,
    quantity: z.coerce.number().int().min(1, "Quantidade mínima 1"),
    unitCost: zCents,
    salePrice: zCents.default(0),
  })
  .superRefine((it, ctx) => {
    if (it.kind === "DEVICE" && (!it.modelId || !it.capacity)) ctx.addIssue({ code: "custom", message: "Informe modelo e capacidade do aparelho" });
    if (it.kind === "ACCESSORY" && !it.accessoryId) ctx.addIssue({ code: "custom", message: "Selecione o acessório" });
  });

export const purchaseSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string().min(1, "Selecione o fornecedor"),
  expectedAt: zDate,
  dueDate: zDate,
  notes: optionalString,
  items: z.array(purchaseItemSchema).min(1, "Adicione ao menos um item"),
});
export type PurchaseInput = z.input<typeof purchaseSchema>;

export const receiveSchema = z.object({
  purchaseId: z.string(),
  dueDate: zDate,
  paid: z.boolean().default(false),
  accountId: optionalString,
  items: z.array(
    z.object({
      itemId: z.string(),
      quantity: z.coerce.number().int().min(0).default(0),
      devices: z
        .array(
          z.object({
            imei: zImeiOptional(),
            imei2: optionalString,
            serial: optionalString,
            color: optionalString,
            batteryHealth: zOptionalInt(0, 100),
            grade: z.union([z.enum(GRADES.values), z.literal("")]).optional().nullable(),
          }),
        )
        .default([]),
    }),
  ),
});
export type ReceiveInput = z.input<typeof receiveSchema>;

const checklistKeys = TRADE_IN_CHECKLIST.map((c) => c.key);

export const usedPurchaseSchema = z.object({
  customerId: z.string().min(1, "Selecione o vendedor (cliente)"),
  imei: zImei,
  imei2: optionalString,
  serial: optionalString,
  modelId: z.string().min(1, "Selecione o modelo"),
  capacity: z.string().min(1, "Selecione a capacidade"),
  color: z.string().min(1, "Selecione a cor"),
  batteryHealth: zOptionalInt(0, 100),
  grade: z.union([z.enum(GRADES.values), z.literal("")]).optional().nullable(),
  checklist: z.record(z.string(), z.boolean()).refine((c) => checklistKeys.every((k) => k in c), "Preencha o checklist"),
  photos: z.array(z.string()).default([]),
  notes: optionalString,
  value: zCents.refine((v) => v > 0, "Informe o valor pago"),
  salePrice: zCents.default(0),
  paymentMethod: z.enum(["DINHEIRO", "PIX", "TRANSFERENCIA"]),
  accountId: optionalString,
});
export type UsedPurchaseInput = z.input<typeof usedPurchaseSchema>;
