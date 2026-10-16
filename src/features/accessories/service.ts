import type { Tx } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { notify } from "@/features/notifications/service";

/**
 * Movimenta o estoque de um acessório. `delta` positivo entra, negativo sai.
 * Atualiza o custo médio nas entradas e alerta estoque baixo.
 */
export async function moveAccessory(
  tx: Tx,
  m: {
    accessoryId: string;
    type: "ENTRADA" | "SAIDA" | "AJUSTE" | "PERDA";
    delta: number;
    unitCost?: number;
    reason?: string;
    refType?: string;
    refId?: string;
    userId?: string | null;
    allowNegative?: boolean;
  },
) {
  const acc = await tx.accessory.findUniqueOrThrow({ where: { id: m.accessoryId } });
  const newQty = acc.quantity + m.delta;
  if (newQty < 0 && !m.allowNegative) {
    throw new BusinessError(`Estoque insuficiente de "${acc.name}": disponível ${acc.quantity}, necessário ${-m.delta}.`);
  }

  // custo médio ponderado nas entradas com custo informado
  let cost = acc.cost;
  if (m.delta > 0 && m.type === "ENTRADA" && m.unitCost != null && m.unitCost > 0) {
    const base = Math.max(acc.quantity, 0);
    cost = Math.round((base * acc.cost + m.delta * m.unitCost) / (base + m.delta));
  }

  await tx.accessory.update({ where: { id: acc.id }, data: { quantity: newQty, cost } });
  await tx.stockMovement.create({
    data: {
      accessoryId: acc.id,
      type: m.type,
      quantity: m.delta,
      unitCost: m.unitCost ?? acc.cost,
      reason: m.reason,
      refType: m.refType,
      refId: m.refId,
      userId: m.userId ?? null,
    },
  });

  if (m.delta < 0 && acc.minStock > 0 && acc.quantity > acc.minStock && newQty <= acc.minStock) {
    await notify(tx, {
      type: "STOCK_LOW",
      title: `Estoque baixo: ${acc.name}`,
      body: `Restam ${newQty} unidade(s) (mínimo ${acc.minStock}).`,
      href: `/estoque/acessorios?q=${encodeURIComponent(acc.sku)}`,
    });
  }
  return { ...acc, quantity: newQty, cost };
}
