import { z } from "zod";
import { ACCESSORY_CATEGORY } from "@/domain/constants";
import { optionalString, zCents } from "@/lib/validators";

export const accessorySchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(1, "Informe o SKU").toUpperCase(),
  barcode: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\s/g, "") : null)),
  name: z.string().trim().min(2, "Informe o nome"),
  category: z.enum(ACCESSORY_CATEGORY.values),
  brand: optionalString,
  compatibility: z.array(z.string()).default([]),
  cost: zCents,
  price: zCents,
  minStock: z.coerce.number().int().min(0),
  isPart: z.boolean().default(false),
  initialQty: z.coerce.number().int().min(0).optional(),
});
export type AccessoryInput = z.input<typeof accessorySchema>;

export const movementSchema = z.object({
  accessoryId: z.string(),
  type: z.enum(["ENTRADA", "SAIDA", "AJUSTE", "PERDA"]),
  /** ENTRADA/SAIDA/PERDA: quantidade positiva; AJUSTE: nova quantidade em estoque */
  quantity: z.coerce.number().int().min(0),
  unitCost: zCents.optional(),
  reason: z.string().trim().min(3, "Informe o motivo"),
});
export type MovementInput = z.input<typeof movementSchema>;
