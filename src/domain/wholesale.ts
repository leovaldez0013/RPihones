// Lista para atacado: ordena, agrupa aparelhos idênticos e formata data/hora de Brasília.
// Só recebe dados que podem ir para o lojista (sem IMEI, custo, fornecedor, observações ou cliente).

export type WholesaleDevice = {
  id: string;
  model: string;
  modelId: string;
  /** linha do aparelho ("iPhone 18" → 18): define o que é mais novo */
  generation: number;
  year: number;
  modelOrder: number;
  capacity: string;
  color: string;
  battery: number | null;
  price: number; // centavos: valor atacado ou, se vazio, o preço de venda
};

export type BatteryBand = "ALTA" | "MEDIA" | "BAIXA" | "SEM";

export type WholesaleRow = {
  model: string;
  capacity: string;
  color: string;
  band: BatteryBand;
  batteryMin: number | null;
  batteryMax: number | null;
  quantity: number;
  price: number;
};

/** verde ≥ 90%, amarelo 80–89%, vermelho < 80% */
export function batteryBand(battery: number | null): BatteryBand {
  if (battery == null) return "SEM";
  if (battery >= 90) return "ALTA";
  if (battery >= 80) return "MEDIA";
  return "BAIXA";
}

/** "1TB" → 1024, "256GB" → 256 (para ordenar capacidades). */
export function capacityGb(capacity: string) {
  const n = parseFloat(capacity.replace(",", "."));
  if (Number.isNaN(n)) return 0;
  return /tb/i.test(capacity) ? n * 1024 : n;
}

/** "iPhone 18" → 18 (linha do catálogo); sem número → 0. */
export function generationOf(family: string) {
  const m = family.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Modelo do mais novo ao mais antigo (linha, ano, ordem do catálogo), depois armazenamento, cor e bateria. */
export function sortWholesale<T extends WholesaleDevice>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.generation - a.generation ||
      b.year - a.year ||
      a.modelOrder - b.modelOrder ||
      a.model.localeCompare(b.model, "pt-BR") ||
      capacityGb(a.capacity) - capacityGb(b.capacity) ||
      a.color.localeCompare(b.color, "pt-BR") ||
      (b.battery ?? -1) - (a.battery ?? -1) ||
      a.price - b.price,
  );
}

/** Agrupa aparelhos iguais (modelo, GB, cor, faixa de bateria e valor) numa linha com quantidade. */
export function groupWholesale(items: WholesaleDevice[]): WholesaleRow[] {
  const rows: WholesaleRow[] = [];
  const byKey = new Map<string, WholesaleRow>();
  for (const d of sortWholesale(items)) {
    const band = batteryBand(d.battery);
    const key = [d.modelId, d.capacity, d.color, band, d.price].join("|");
    const row = byKey.get(key);
    if (row) {
      row.quantity += 1;
      if (d.battery != null) {
        row.batteryMin = Math.min(row.batteryMin ?? d.battery, d.battery);
        row.batteryMax = Math.max(row.batteryMax ?? d.battery, d.battery);
      }
      continue;
    }
    const created: WholesaleRow = { model: d.model, capacity: d.capacity, color: d.color, band, batteryMin: d.battery, batteryMax: d.battery, quantity: 1, price: d.price };
    byKey.set(key, created);
    rows.push(created);
  }
  return rows;
}

/** "92%" ou, para um grupo, "90–95%"; sem informação: "—". */
export function batteryLabel(row: Pick<WholesaleRow, "batteryMin" | "batteryMax">) {
  if (row.batteryMin == null || row.batteryMax == null) return "—";
  return row.batteryMin === row.batteryMax ? `${row.batteryMin}%` : `${row.batteryMin}–${row.batteryMax}%`;
}

/** Partes da data/hora no horário de Brasília. */
function brasiliaParts(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: parts.day, month: parts.month, year: parts.year, hour: parts.hour, minute: parts.minute };
}

/** "27/10/2026 às 14:05" (horário de Brasília). */
export function generatedAtLabel(date: Date) {
  const p = brasiliaParts(date);
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

/** "estoque-atacado-2026-10-27-1405.pdf" (com a hora, para não sobrescrever listas do mesmo dia). */
export function wholesaleFileName(date: Date) {
  const p = brasiliaParts(date);
  return `estoque-atacado-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}.pdf`;
}
