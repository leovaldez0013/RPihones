import { z } from "zod";
import { CARD_BRANDS, GRADES } from "@/domain/constants";
import { optionalString, zCents, zDate, zOptionalInt } from "@/lib/validators";
import { zImei } from "@/features/devices/schemas";

export const saleItemSchema = z.object({
  kind: z.enum(["DEVICE", "ACCESSORY", "SERVICE"]),
  deviceId: optionalString,
  accessoryId: optionalString,
  description: optionalString,
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: zCents.optional(), // só usado para SERVICE; aparelhos e acessórios usam o preço cadastrado
  discount: zCents.default(0),
});

export const tradeInSchema = z.object({
  key: z.string(), // id local (cliente) para ligar ao pagamento
  imei: zImei,
  imei2: optionalString,
  serial: optionalString,
  modelId: z.string().min(1, "Modelo do aparelho de troca"),
  capacity: z.string().min(1, "Capacidade do aparelho de troca"),
  color: z.string().min(1, "Cor do aparelho de troca"),
  batteryHealth: zOptionalInt(0, 100),
  grade: z.union([z.enum(GRADES.values), z.literal("")]).optional().nullable(),
  checklist: z.record(z.string(), z.boolean()),
  photos: z.array(z.string()).default([]),
  notes: optionalString,
  suggestedValue: zCents,
  finalValue: zCents.refine((v) => v > 0, "Valor da troca deve ser maior que zero"),
});
export type TradeInInput = z.input<typeof tradeInSchema>;

export const paymentSchema = z.object({
  method: z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO", "CREDITO_PARCELADO", "BOLETO", "CREDIARIO", "TROCA", "SINAL"]),
  amount: zCents.refine((v) => v > 0, "Valor do pagamento deve ser maior que zero"),
  installments: z.coerce.number().int().min(1).max(24).default(1),
  brand: z.enum(CARD_BRANDS).optional().nullable(),
  accountId: optionalString,
  tradeInKey: optionalString,
  firstDueDate: zDate, // boleto/crediário
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const saleSchema = z.object({
  id: z.string().optional(),
  action: z.enum(["ORCAMENTO", "CONCLUIR"]),
  customerId: optionalString,
  sellerId: optionalString,
  orderId: optionalString,
  items: z.array(saleItemSchema).min(1, "Adicione ao menos um item"),
  discount: zCents.default(0),
  payments: z.array(paymentSchema).default([]),
  tradeIns: z.array(tradeInSchema).default([]),
  notes: optionalString,
  validUntil: zDate,
  approval: z.object({ email: z.string(), password: z.string() }).optional().nullable(),
});
export type SaleInput = z.input<typeof saleSchema>;
export type SaleData = z.output<typeof saleSchema>;

export const cancelSaleSchema = z.object({
  id: z.string(),
  type: z.enum(["CANCELAMENTO", "DEVOLUCAO"]),
  reason: z.string().trim().min(3, "Informe o motivo"),
});
