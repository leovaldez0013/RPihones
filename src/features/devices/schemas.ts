import { z } from "zod";
import { DEVICE_CONDITION, DEVICE_STATUS, GRADES } from "@/domain/constants";
import { normalizeImei, validateImei } from "@/domain/imei";
import { optionalString, zCents, zDate, zOptionalInt } from "@/lib/validators";

/** IMEI obrigatório (troca e compra de pessoa física: comprova a procedência). */
export const zImei = z
  .string()
  .transform(normalizeImei)
  .superRefine((v, ctx) => {
    const r = validateImei(v);
    if (!r.formatOk || !r.luhnOk) ctx.addIssue({ code: "custom", message: r.message });
  });

/** IMEI opcional: vazio vira null; preenchido precisa ser válido. */
export const zImeiOptional = (label = "IMEI") =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => normalizeImei(v) || null)
    .superRefine((v, ctx) => {
      if (!v) return;
      const r = validateImei(v);
      if (!r.formatOk || !r.luhnOk) ctx.addIssue({ code: "custom", message: label === "IMEI" ? r.message : `${label}: ${r.message}` });
    });

export const deviceSchema = z.object({
  id: z.string().optional(),
  imei: zImeiOptional(),
  imei2: zImeiOptional("IMEI 2"),
  serial: optionalString,
  modelId: z.string().min(1, "Selecione o modelo"),
  capacity: z.string().min(1, "Selecione a capacidade"),
  color: z.string().min(1, "Selecione a cor"),
  condition: z.enum(DEVICE_CONDITION.values),
  batteryHealth: zOptionalInt(0, 100, "Bateria deve estar entre 0 e 100%"),
  grade: z
    .union([z.enum(GRADES.values), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => v || null),
  notes: optionalString,
  photos: z.array(z.string()).default([]),
  supplierId: optionalString,
  acquisitionCost: zCents,
  salePrice: zCents,
  entryDate: zDate,
  appleWarrantyUntil: zDate,
  status: z.enum(DEVICE_STATUS.values).default("DISPONIVEL"),
  /** confirma salvar com modelo diferente do que o TAC costuma indicar */
  confirmTacMismatch: z.boolean().optional(),
});
export type DeviceInput = z.input<typeof deviceSchema>;
export type DeviceData = z.output<typeof deviceSchema>;

export const modelSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Informe o nome do modelo"),
  family: z.string().trim().min(3),
  year: z.coerce.number().int().min(2007).max(2100),
  colors: z.array(z.string().trim().min(1)).min(1, "Informe ao menos uma cor"),
  capacities: z.array(z.string().trim().min(1)).min(1, "Informe ao menos uma capacidade"),
  active: z.boolean().default(true),
});

export const tacSchema = z.object({
  tac: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8, "TAC tem 8 dígitos"),
  modelId: z.string().min(1),
  note: optionalString,
});
