import type { ColumnFormat } from "@/domain/reports";
import { formatBRL } from "@/domain/money";
import { formatDate, formatPct } from "./format";

/** Formata um valor de relatório para exibição (tela e PDF). */
export function formatCell(value: string | number | null | undefined, format: ColumnFormat): string {
  if (value == null || value === "") return "—";
  switch (format) {
    case "money":
      return formatBRL(Number(value));
    case "int":
      return Number(value).toLocaleString("pt-BR");
    case "pct":
      return formatPct(Number(value));
    case "date":
      return formatDate(String(value));
    case "days":
      return `${Number(value).toLocaleString("pt-BR")} dias`;
    default:
      return String(value);
  }
}

/** Valor "cru" para planilha: dinheiro em reais, datas em dd/mm/aaaa. */
export function sheetValue(value: string | number | null | undefined, format: ColumnFormat): string | number | null {
  if (value == null) return null;
  if (format === "money") return Number(value) / 100;
  if (format === "pct") return Math.round(Number(value) * 10) / 10;
  if (format === "date") return formatDate(String(value));
  return value;
}

export function isNumeric(format: ColumnFormat) {
  return format === "money" || format === "int" || format === "pct" || format === "days";
}
