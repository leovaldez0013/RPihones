"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, ci } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { evaluateTradeIn } from "@/domain/trade-in";
import { TRADE_IN_CHECKLIST } from "@/domain/constants";
import { cancelSaleSchema, saleSchema } from "./schemas";
import { cancelSale, saveSale } from "./service";
import { getTradeInAdjustments } from "./config";

export const saveSaleAction = action({ schema: saleSchema, permission: "sales.create" }, async (data, { user }) => {
  const sale = await db.$transaction((tx) => saveSale(tx, data, user), { timeout: 30000 });
  revalidatePath("/vendas");
  revalidatePath("/estoque/aparelhos");
  return { id: sale.id, number: sale.number, status: sale.status };
});

export const cancelSaleAction = action({ schema: cancelSaleSchema, permission: "sales.cancel" }, async (data, { user }) => {
  await db.$transaction((tx) => cancelSale(tx, data, user), { timeout: 30000 });
  revalidatePath(`/vendas/${data.id}`);
  revalidatePath("/vendas");
  return true;
});

/** Orçamento pode ser cancelado por quem vende (não mexe em financeiro). */
export const cancelQuoteAction = action({ schema: z.object({ id: z.string(), reason: z.string().min(3) }), permission: "sales.create" }, async ({ id, reason }, { user }) => {
  const s = await db.sale.findUniqueOrThrow({ where: { id } });
  if (s.status !== "ORCAMENTO") throw new BusinessError("Só orçamentos podem ser cancelados aqui.");
  await db.$transaction((tx) => cancelSale(tx, { id, type: "CANCELAMENTO", reason }, user));
  revalidatePath("/vendas");
  return true;
});

export type Sellable =
  | { type: "DEVICE"; id: string; title: string; subtitle: string; price: number; status: string; imei: string; condition: string; reservedForOther: boolean; exact: boolean }
  | { type: "ACCESSORY"; id: string; title: string; subtitle: string; price: number; stock: number; exact: boolean };

/** Busca o que pode ser vendido: aparelhos por IMEI/modelo, acessórios por nome/SKU/código de barras. */
export const searchSellables = action(
  { schema: z.object({ q: z.string(), customerId: z.string().optional().nullable(), saleId: z.string().optional().nullable() }), permission: "sales.create" },
  async ({ q, customerId, saleId }): Promise<Sellable[]> => {
    const term = q.trim();
    if (term.length < 2) return [];
    const digits = term.replace(/\D/g, "");
    const numeric = digits.length >= 4 && digits.length === term.replace(/\s/g, "").length;
    const words = term.split(/\s+/).filter(Boolean);

    const [devices, accessories] = await Promise.all([
      db.device.findMany({
        where: {
          deletedAt: null,
          status: { in: ["DISPONIVEL", "RESERVADO"] },
          ...(numeric
            ? { OR: [{ imei: { contains: digits } }, { imei2: { contains: digits } }] }
            : words.length === 1 && words[0].length >= 8
              ? { serial: ci(words[0]) }
              : { AND: words.map((w) => ({ OR: [{ model: { name: ci(w) } }, { capacity: ci(w) }, ...(w.length >= 4 ? [{ color: ci(w) }] : [])] })) }),
        },
        include: { model: true },
        take: 20,
        orderBy: [{ status: "asc" }, { entryDate: "asc" }],
      }),
      db.accessory.findMany({
        where: {
          deletedAt: null,
          active: true,
          ...(numeric ? { OR: [{ barcode: digits }, { sku: ci(term) }] } : { AND: words.map((w) => ({ OR: [{ name: ci(w) }, { sku: ci(w) }, { compatibility: ci(w) }] })) }),
        },
        take: 12,
        orderBy: { name: "asc" },
      }),
    ]);

    return [
      ...devices.map((d): Sellable => {
        const mine = (saleId && d.reservedForSaleId === saleId) || (!!customerId && d.reservedCustomerId === customerId);
        return {
          type: "DEVICE",
          id: d.id,
          title: `${d.model.name} ${d.capacity}`,
          subtitle: `${d.color} · ${d.batteryHealth != null ? `bateria ${d.batteryHealth}% · ` : ""}IMEI ${d.imei}`,
          price: d.salePrice,
          status: d.status,
          imei: d.imei,
          condition: d.condition,
          reservedForOther: d.status === "RESERVADO" && !mine,
          exact: numeric && (d.imei === digits || d.imei2 === digits),
        };
      }),
      ...accessories.map(
        (a): Sellable => ({
          type: "ACCESSORY",
          id: a.id,
          title: a.name,
          subtitle: `SKU ${a.sku}${a.barcode ? ` · ${a.barcode}` : ""}`,
          price: a.price,
          stock: a.quantity,
          exact: numeric && a.barcode === digits,
        }),
      ),
    ];
  },
);

/** Sugere valor de avaliação a partir da tabela (modelo × capacidade) e dos ajustes. */
export const evaluateTradeInAction = action(
  {
    schema: z.object({
      modelId: z.string(),
      capacity: z.string(),
      batteryHealth: z.number().int().min(0).max(100).nullable().optional(),
      grade: z.string().nullable().optional(),
      checklist: z.record(z.string(), z.boolean()),
    }),
    permission: "sales.create",
  },
  async (input) => {
    const [price, adj] = await Promise.all([
      db.tradeInPrice.findUnique({ where: { modelId_capacity_condition: { modelId: input.modelId, capacity: input.capacity, condition: "SEMINOVO" } } }),
      getTradeInAdjustments(db),
    ]);
    const labels = Object.fromEntries(TRADE_IN_CHECKLIST.map((c) => [c.key, c.label]));
    return { hasTable: !!price, ...evaluateTradeIn(price?.baseValue ?? 0, input, adj, labels) };
  },
);
