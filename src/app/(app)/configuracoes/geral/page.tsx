import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { OperationalForm } from "./operational-form";

export const metadata: Metadata = { title: "Parâmetros gerais" };

export default async function GeneralSettingsPage() {
  await requirePage("settings.operational");
  const s = await db.storeSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Parâmetros gerais" back="/configuracoes" />
      <OperationalForm
        defaults={{
          staleStockDays: s.staleStockDays,
          tradeInDefaultStatus: s.tradeInDefaultStatus as "EM_AVALIACAO" | "DISPONIVEL",
          postSaleDays: s.postSaleDays,
          warrantyAlertDays: s.warrantyAlertDays,
        }}
      />
    </div>
  );
}
