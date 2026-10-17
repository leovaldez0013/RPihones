import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OperationalForm } from "./operational-form";
import { ImeiSettingsForm } from "./imei-settings-form";

export const metadata: Metadata = { title: "Parâmetros gerais" };

export default async function GeneralSettingsPage() {
  const user = await requirePage("settings.operational");
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
      {can(user.role, "settings.store") && (
        <ImeiSettingsForm
          defaults={{
            provider: s.imeiProvider,
            apiUrl: s.imeiApiUrl ?? "",
            // a chave em si nunca vai para o navegador
            hasKey: !!s.imeiApiKey,
            envUrl: !!process.env.IMEI_API_URL,
            envKey: !!process.env.IMEI_API_KEY,
          }}
        />
      )}
    </div>
  );
}
