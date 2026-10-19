import { z } from "zod";
import { SO_KIND, SO_PRIORITY, SO_STATUS } from "@/domain/constants";
import { optionalString, zCents, zDate } from "@/lib/validators";

const editable = {
  technicianId: optionalString,
  problem: z.string().trim().min(3, "Descreva o defeito ou o serviço"),
  services: optionalString,
  diagnosis: optionalString,
  laborCost: zCents.default(0),
  price: zCents.default(0),
  priority: z.enum(SO_PRIORITY.values).default("NORMAL"),
  dueDate: zDate,
  checklist: z.record(z.string(), z.boolean()).default({}),
  photos: z.array(z.string()).default([]),
};

export const soCreateSchema = z
  .object({
    kind: z.enum(SO_KIND.values),
    deviceId: optionalString,
    deviceDescription: optionalString,
    modelId: optionalString,
    color: optionalString,
    imei: optionalString,
    customerId: optionalString,
    ...editable,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "INTERNA" && !v.deviceId) ctx.addIssue({ code: "custom", path: ["deviceId"], message: "Selecione o aparelho do estoque" });
    if (v.kind === "CLIENTE" && !v.customerId) ctx.addIssue({ code: "custom", path: ["customerId"], message: "Selecione o cliente" });
    if (v.kind === "CLIENTE" && !v.deviceId && !v.deviceDescription && !v.modelId) ctx.addIssue({ code: "custom", path: ["modelId"], message: "Informe o modelo do aparelho do cliente" });
    if (v.kind === "GARANTIA") ctx.addIssue({ code: "custom", path: ["kind"], message: "OS de garantia é aberta pelo acionamento da garantia." });
  });
export type SoCreateInput = z.input<typeof soCreateSchema>;

export const soUpdateSchema = z.object({ id: z.string(), ...editable });
export type SoUpdateInput = z.input<typeof soUpdateSchema>;

export const soMoveSchema = z.object({ id: z.string(), status: z.enum(SO_STATUS.values), index: z.number().int().min(0) });

export const soPartSchema = z.object({
  serviceOrderId: z.string(),
  accessoryId: z.string().min(1, "Selecione a peça"),
  quantity: z.coerce.number().int().min(1, "Quantidade mínima 1"),
  unitPrice: zCents.default(0),
});

export const SO_DELIVERY_METHODS = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "A_RECEBER"] as const;
export const soDeliverSchema = z.object({ id: z.string(), method: z.enum(SO_DELIVERY_METHODS).optional() });
export const soCancelSchema = z.object({ id: z.string(), reason: z.string().trim().min(3, "Informe o motivo") });
