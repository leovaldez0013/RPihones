// Sugestão de valor de avaliação de aparelho usado na troca.

export type TradeInAdjustments = {
  battery: { min: number; max: number; pct: number }[]; // ex.: 85–89% → -5
  grade: Record<string, number>; // ex.: { "A+": 3, A: 0, B: -8, C: -18 }
  checklist: Record<string, number>; // desconto % se o item falhar
};

export const DEFAULT_TRADE_IN_ADJUSTMENTS: TradeInAdjustments = {
  battery: [
    { min: 90, max: 100, pct: 0 },
    { min: 85, max: 89, pct: -5 },
    { min: 80, max: 84, pct: -10 },
    { min: 0, max: 79, pct: -18 },
  ],
  grade: { "A+": 3, A: 0, B: -8, C: -18 },
  checklist: { tela: -25, faceId: -20, cameras: -15, altoFalantes: -5, microfone: -5, botoes: -5, carregamento: -8, trueTone: -5 },
};

/** Itens que impedem a compra/troca. */
export const BLOCKING_ITEMS = ["icloud", "semBloqueio"];

export type TradeInEvaluation = {
  base: number;
  adjustments: { label: string; pct: number }[];
  totalPct: number;
  suggested: number;
  blocked: boolean;
  blockReason?: string;
};

export function evaluateTradeIn(
  base: number,
  input: { batteryHealth?: number | null; grade?: string | null; checklist?: Record<string, boolean> },
  adj: TradeInAdjustments = DEFAULT_TRADE_IN_ADJUSTMENTS,
  labels: Record<string, string> = {},
): TradeInEvaluation {
  const adjustments: { label: string; pct: number }[] = [];
  const failed = Object.entries(input.checklist ?? {})
    .filter(([, ok]) => ok === false)
    .map(([k]) => k);
  const blocking = failed.filter((k) => BLOCKING_ITEMS.includes(k));
  if (blocking.length) {
    return {
      base,
      adjustments: [],
      totalPct: -100,
      suggested: 0,
      blocked: true,
      blockReason: blocking.includes("icloud") ? "Conta iCloud vinculada" : "Aparelho com bloqueio/restrição",
    };
  }

  if (input.batteryHealth != null) {
    const b = adj.battery.find((r) => input.batteryHealth! >= r.min && input.batteryHealth! <= r.max);
    if (b && b.pct) adjustments.push({ label: `Bateria ${input.batteryHealth}%`, pct: b.pct });
  }
  if (input.grade && adj.grade[input.grade]) adjustments.push({ label: `Grade ${input.grade}`, pct: adj.grade[input.grade] });
  for (const k of failed) {
    if (adj.checklist[k]) adjustments.push({ label: labels[k] ?? k, pct: adj.checklist[k] });
  }

  const totalPct = Math.max(-90, adjustments.reduce((s, a) => s + a.pct, 0));
  const raw = Math.round(base * (1 + totalPct / 100));
  // arredonda para baixo em múltiplos de R$ 10
  const suggested = Math.max(0, Math.floor(raw / 1000) * 1000);
  return { base, adjustments, totalPct, suggested, blocked: false };
}
