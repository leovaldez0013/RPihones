export const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Período padrão: do dia 1º do mês até hoje. `ate` é inclusivo (vira o dia seguinte 00:00 em São Paulo). */
export function parsePeriod(de?: string | null, ate?: string | null) {
  const today = ymd(new Date());
  const valid = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  let fromStr = valid(de) ?? `${today.slice(0, 8)}01`;
  let toStr = valid(ate) ?? today;
  if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
  const from = new Date(`${fromStr}T00:00:00-03:00`);
  const to = new Date(new Date(`${toStr}T00:00:00-03:00`).getTime() + 86400000);
  return { fromStr, toStr, from, to };
}
