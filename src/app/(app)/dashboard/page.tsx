import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePage } from "@/lib/session";
import { formatLongDate } from "@/lib/format";
import { LayoutDashboard } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function DashboardPage() {
  const user = await requirePage("dashboard.view");
  return (
    <div>
      <PageHeader title={`${greeting()}, ${user.name.split(" ")[0]}`} description={formatLongDate(new Date())} />
      <div className="rounded-2xl border bg-card shadow-soft">
        <EmptyState
          icon={LayoutDashboard}
          title="Dashboard em construção"
          description="Os indicadores de vendas, estoque e financeiro aparecem aqui na fase 10."
        />
      </div>
    </div>
  );
}
