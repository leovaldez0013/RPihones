import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { CommissionRules } from "./commission-rules";

export const metadata: Metadata = { title: "Comissões" };

export default async function CommissionSettingsPage() {
  await requirePage("settings.operational");
  const [rules, users] = await Promise.all([
    db.commissionRule.findMany(),
    db.user.findMany({ where: { active: true, deletedAt: null, role: { in: ["VENDEDOR", "GERENTE", "ADMIN"] } }, select: { id: true, name: true, commissionPct: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back="/configuracoes"
        title="Regras de comissão"
        description="% sobre o valor líquido de cada item vendido. Regra do vendedor > regra geral > % padrão do vendedor (cadastro de usuários)."
      />
      <CommissionRules rules={rules.map((r) => ({ userId: r.userId, category: r.category, pct: r.pct }))} users={users} />
    </div>
  );
}
