import { z } from "zod";
import { optionalString, zCEP, zCPF, zCpfCnpj, zDate, zEmail, zPhone } from "@/lib/validators";

export const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Informe o nome completo"),
  cpf: zCPF,
  phone: zPhone,
  email: zEmail,
  birthDate: zDate,
  cep: zCEP,
  street: optionalString,
  number: optionalString,
  complement: optionalString,
  district: optionalString,
  city: optionalString,
  state: optionalString,
  notes: optionalString,
  marketingConsent: z.boolean().default(false),
});
export type CustomerInput = z.input<typeof customerSchema>;

export const supplierSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["PJ", "PF"]),
  name: z.string().trim().min(2, "Informe o nome"),
  document: zCpfCnpj,
  phone: zPhone,
  email: zEmail,
  contact: optionalString,
  cep: zCEP,
  street: optionalString,
  number: optionalString,
  district: optionalString,
  city: optionalString,
  state: optionalString,
  notes: optionalString,
});
export type SupplierInput = z.input<typeof supplierSchema>;
