/** Normaliza para busca: sem acentos e minúsculo. */
export function normalizeSearch(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Busca das tabelas: trecho do texto (sem acento) ou, se a busca tem 3+ dígitos, a sequência de dígitos (IMEI, telefone). */
export function matchesSearch(text: string, query: string) {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  const hay = normalizeSearch(text);
  const digits = q.replace(/\D/g, "");
  return hay.includes(q) || (digits.length >= 3 && hay.replace(/\D/g, "").includes(digits));
}
