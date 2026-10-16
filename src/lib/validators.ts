import { z } from "zod";
import { onlyDigits } from "./format";

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(cpf[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCNPJ(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = weights.reduce((acc, w, i) => acc + Number(c[i]) * w, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

// ── Helpers Zod reutilizáveis ──

/** String opcional: "" vira undefined. */
export const optionalString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const zCPF = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? onlyDigits(v) : null))
  .refine((v) => !v || isValidCPF(v), "CPF inválido");

export const zCpfCnpj = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? onlyDigits(v) : null))
  .refine((v) => !v || (v.length === 11 ? isValidCPF(v) : isValidCNPJ(v)), "CPF/CNPJ inválido");

export const zPhone = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? onlyDigits(v) : null))
  .refine((v) => !v || v.length === 10 || v.length === 11, "Telefone inválido");

export const zCEP = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? onlyDigits(v) : null))
  .refine((v) => !v || v.length === 8, "CEP inválido");

export const zEmail = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => !v || z.email().safeParse(v).success, "E-mail inválido");

/** Centavos (inteiro >= 0). */
export const zCents = z.coerce.number().int("Valor inválido").min(0, "Valor não pode ser negativo");

/** Data vinda de input type=date (yyyy-mm-dd) ou ISO. */
export const zDate = z
  .union([z.string(), z.date()])
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    // yyyy-mm-dd → meio-dia em São Paulo para evitar troca de dia por fuso
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00-03:00`);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });
