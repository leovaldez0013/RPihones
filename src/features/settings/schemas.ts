import { z } from "zod";
import { optionalString, zCEP, zCpfCnpj, zEmail, zPhone } from "@/lib/validators";
import { ROLES } from "@/domain/constants";

export const storeSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja"),
  legalName: optionalString,
  cnpj: zCpfCnpj,
  phone: zPhone,
  whatsapp: zPhone,
  email: zEmail,
  instagram: optionalString,
  website: optionalString,
  logoUrl: optionalString,
  googleReviewUrl: optionalString,
  cep: zCEP,
  street: optionalString,
  number: optionalString,
  complement: optionalString,
  district: optionalString,
  city: optionalString,
  state: optionalString,
});
export type StoreInput = z.input<typeof storeSchema>;

export const operationalSchema = z.object({
  staleStockDays: z.coerce.number().int().min(1).max(365),
  tradeInDefaultStatus: z.enum(["EM_AVALIACAO", "DISPONIVEL"]),
  postSaleDays: z.coerce.number().int().min(1).max(60),
  warrantyAlertDays: z.coerce.number().int().min(1).max(90),
});
export type OperationalInput = z.input<typeof operationalSchema>;

export const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")),
  role: z.enum(ROLES.values),
  phone: zPhone,
  commissionPct: z.coerce.number().min(0).max(100),
  discountLimitPct: z.coerce.number().min(0).max(100),
  password: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || v.length >= 6, "Senha deve ter ao menos 6 caracteres"),
  active: z.boolean(),
});
export type UserInput = z.input<typeof userSchema>;
