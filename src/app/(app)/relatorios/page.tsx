import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Landmark, Percent } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { REPORTS, buildReport, type ReportKey } from "@/features/reports/queries";
import { spDayStart } from "@/features/dashboard/queries";
import { parsePeriod, ymd } from "@/features/reports/period";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tipo?: string; de?: string; ate?: string }> }) {
  await requirePage("reports.view");
  const sp = await searchParams;
  const key = (REPORTS.find((r) => r.key === sp.tipo)?.key ?? "vendas") as ReportKey;
  const { fromStr, toStr, from, to } = parsePeriod(sp.de, sp.ate);
  const report = await buildReport(key, from, to);

  const now = new Date();
  const today = ymd(now);
  const z = new Date(`${today}T12:00:00-03:00`);
  const prevMonthEnd = ymd(new Date(spDayStart(new Date(`${today.slice(0, 8)}01T12:00:00-03:00`)).getTime() - 3600000));
  const presets = [
    { label: "Este mês", de: `${today.slice(0, 8)}01`, ate: today },
    { label: "Mês passado", de: `${prevMonthEnd.slice(0, 8)}01`, ate: prevMonthEnd },
    { label: "Últimos 90 dias", de: ymd(new Date(z.getTime() - 89 * 86400000)), ate: today },
    { label: "Este ano", de: `${today.slice(0, 4)}-01-01`, ate: today },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Relatórios" description="Escolha o relatório e o período. Exporte em PDF, Excel ou CSV." />
      <ReportView
        reports={REPORTS.map((r) => ({ key: r.key, label: r.label }))}
        report={report}
        from={fromStr}
        to={toStr}
        presets={presets}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/financeiro/dre", title: "DRE e lucro", text: "Resultado do mês, por vendedor e por modelo", icon: Landmark },
          { href: "/financeiro/fluxo", title: "Fluxo de caixa", text: "Realizado e previsto, diário ou mensal", icon: BarChart3 },
          { href: "/financeiro/comissoes", title: "Comissões", text: "Por vendedor, com pagamento", icon: Percent },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:border-primary/40">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <c.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{c.title}</span>
              <span className="block text-xs text-muted-foreground">{c.text}</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
