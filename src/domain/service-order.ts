// Cálculos puros da ordem de serviço.

export type SoPart = { quantity: number; unitCost: number; unitPrice: number };

/** Custo interno (mão de obra + peças ao custo) e margem do serviço cobrado. */
export function soTotals(o: { laborCost: number; price: number; parts: SoPart[] }) {
  const partsCost = o.parts.reduce((s, p) => s + p.quantity * p.unitCost, 0);
  const partsPrice = o.parts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
  const cost = o.laborCost + partsCost;
  return { partsCost, partsPrice, cost, charge: o.price, margin: o.price - cost };
}

/** Colunas do Kanban (entregue/cancelada saem do quadro ativo). */
export const SO_BOARD = ["ABERTA", "DIAGNOSTICO", "AGUARDANDO_PECA", "EM_REPARO", "PRONTA"] as const;
export const SO_CLOSED = ["ENTREGUE", "CANCELADA"];

/** Reordena uma coluna inserindo `id` na posição `index`. Retorna os ids na nova ordem. */
export function reorder(ids: string[], id: string, index: number): string[] {
  const rest = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
