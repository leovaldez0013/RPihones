import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { getWarrantyDays } from "@/features/sales/config";
import { db } from "@/lib/db";
import { WarrantyRules } from "./warranty-rules";

export const metadata: Metadata = { title: "Prazos de garantia" };

const LABELS: Record<string, string> = {
  NOVO: "Aparelho novo lacrado",
  SEMINOVO: "Aparelho seminovo",
  VITRINE: "Aparelho de vitrine",
  RECONDICIONADO: "Aparelho recondicionado",
  ACESSORIO: "Acessórios",
  SERVICO: "Serviços (OS)",
};

export default async function WarrantyPage() {
  await requirePage("settings.operational");
  const rules = await getWarrantyDays(db);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back="/configuracoes" title="Prazos de garantia" description="Prazo por condição e cláusulas que aparecem no termo de garantia ({{garantia.clausulas}})." />
      <WarrantyRules rules={Object.entries(LABELS).map(([condition, label]) => ({ condition, label, days: rules[condition]?.days ?? 90, clauses: rules[condition]?.clauses ?? "" }))} />
    </div>
  );
}
