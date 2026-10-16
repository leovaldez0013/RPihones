// Dinheiro sempre em centavos (inteiro).

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number | null | undefined): string {
  return brl.format((cents ?? 0) / 100);
}

/** "1.234,56" | "1234.56" | "R$ 10" → centavos */
export function parseBRL(input: string | number | null | undefined): number {
  if (input == null || input === "") return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const clean = input.replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  // Formato brasileiro: ponto como milhar, vírgula como decimal
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Aplica percentual sobre centavos, arredondando ao centavo. */
export function pct(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/** Divide um valor em N partes inteiras; o resto vai para a primeira parcela. */
export function splitCents(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const rest = total - base * parts;
  return Array.from({ length: parts }, (_, i) => (i === 0 ? base + rest : base));
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
