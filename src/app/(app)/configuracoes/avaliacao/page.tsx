import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { getCatalog } from "@/features/devices/queries";
import { getTradeInAdjustments } from "@/features/sales/config";
import { TradeInSettings } from "./trade-in-settings";

export const metadata: Metadata = { title: "Tabela de avaliação de troca" };

export default async function TradeInSettingsPage() {
  await requirePage("settings.operational");
  const [catalog, prices, adjustments] = await Promise.all([getCatalog(), db.tradeInPrice.findMany({ where: { condition: "SEMINOVO" } }), getTradeInAdjustments(db)]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back="/configuracoes"
        title="Avaliação de troca"
        description="Valor base pago por um seminovo em bom estado (bateria ≥ 90%, grade A, tudo funcionando). O PDV aplica os ajustes abaixo e sugere o valor."
      />
      <TradeInSettings
        catalog={catalog.map((m) => ({ id: m.id, name: m.name, capacities: m.capacities }))}
        prices={Object.fromEntries(prices.map((p) => [`${p.modelId}|${p.capacity}`, p.baseValue]))}
        adjustments={adjustments}
      />
    </div>
  );
}
