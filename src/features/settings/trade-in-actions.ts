"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action } from "@/lib/safe-action";
import { audit } from "@/lib/audit";

export const saveTradeInPrices = action(
  {
    schema: z.object({ prices: z.array(z.object({ modelId: z.string(), capacity: z.string(), baseValue: z.number().int().min(0) })) }),
    permission: "settings.operational",
  },
  async ({ prices }, { user }) => {
    await db.$transaction(async (tx) => {
      for (const p of prices) {
        await tx.tradeInPrice.upsert({
          where: { modelId_capacity_condition: { modelId: p.modelId, capacity: p.capacity, condition: "SEMINOVO" } },
          create: { ...p, condition: "SEMINOVO" },
          update: { baseValue: p.baseValue },
        });
      }
      await audit(tx, { userId: user.id, action: "settings.trade_in_prices", entity: "TradeInPrice", summary: `Tabela de avaliação atualizada (${prices.length} valores)` });
    });
    revalidatePath("/configuracoes/avaliacao");
    return true;
  },
);

export const saveTradeInAdjustments = action(
  {
    schema: z.object({
      battery: z.array(z.object({ min: z.number().int(), max: z.number().int(), pct: z.number() })),
      grade: z.record(z.string(), z.number()),
      checklist: z.record(z.string(), z.number()),
    }),
    permission: "settings.operational",
  },
  async (adj, { user }) => {
    const data = { battery: JSON.stringify(adj.battery), grade: JSON.stringify(adj.grade), checklist: JSON.stringify(adj.checklist) };
    await db.$transaction(async (tx) => {
      await tx.tradeInAdjustments.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
      await audit(tx, { userId: user.id, action: "settings.trade_in_adjustments", entity: "TradeInAdjustments", after: adj });
    });
    revalidatePath("/configuracoes/avaliacao");
    return true;
  },
);
