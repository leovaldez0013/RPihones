import { format, formatDistanceToNowStrict, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

export { formatBRL, parseBRL } from "@/domain/money";

export const TIMEZONE = "America/Sao_Paulo";

type DateInput = Date | string | number | null | undefined;

function toDate(d: DateInput): Date | null {
  if (d == null || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Converte para o horário de São Paulo para exibição. */
export function zoned(d: DateInput): Date | null {
  const date = toDate(d);
  return date ? toZonedTime(date, TIMEZONE) : null;
}

export function formatDate(d: DateInput): string {
  const z = zoned(d);
  return z ? format(z, "dd/MM/yyyy", { locale: ptBR }) : "—";
}

export function formatDateTime(d: DateInput): string {
  const z = zoned(d);
  return z ? format(z, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
}

export function formatLongDate(d: DateInput): string {
  const z = zoned(d);
  return z ? format(z, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : "—";
}

export function formatRelative(d: DateInput): string {
  const date = toDate(d);
  return date ? formatDistanceToNowStrict(date, { locale: ptBR, addSuffix: true }) : "—";
}

export function daysSince(d: DateInput): number {
  const date = toDate(d);
  return date ? differenceInCalendarDays(new Date(), date) : 0;
}

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function formatCPF(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 11) return v ?? "";
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatCNPJ(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 14) return v ?? "";
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatDocument(v: string | null | undefined): string {
  const d = onlyDigits(v);
  return d.length === 14 ? formatCNPJ(d) : formatCPF(d);
}

export function formatPhone(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v ?? "";
}

export function formatCEP(v: string | null | undefined): string {
  const d = onlyDigits(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : (v ?? "");
}

export function formatPct(v: number, digits = 1): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Link wa.me com mensagem pré-preenchida (Brasil: prefixo 55). */
export function whatsappLink(phone: string | null | undefined, message: string): string {
  let d = onlyDigits(phone);
  if (d && !d.startsWith("55")) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
}
