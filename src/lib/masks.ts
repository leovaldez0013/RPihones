// Máscaras de digitação (aplicadas no onChange dos inputs).
import { onlyDigits } from "./format";

export function maskCPF(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskCNPJ(v: string): string {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskCpfCnpj(v: string): string {
  return onlyDigits(v).length > 11 ? maskCNPJ(v) : maskCPF(v);
}

export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function maskCEP(v: string): string {
  return onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

export function maskIMEI(v: string): string {
  return onlyDigits(v).slice(0, 15);
}

/** Máscara de moeda estilo "caixa registradora": digita centavos. */
export function maskMoneyFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
