"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/inputs";
import type { Report, ReportRow } from "@/domain/reports";
import { formatCell, isNumeric, sheetValue } from "@/lib/report-format";
import { cn } from "@/lib/utils";

const CLASS_TONE: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  B: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  C: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export function ReportView({
  reports,
  report,
  from,
  to,
  presets,
}: {
  reports: { key: string; label: string }[];
  report: Report;
  from: string;
  to: string;
  presets: { label: string; de: string; ate: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [de, setDe] = useState(from);
  const [ate, setAte] = useState(to);
  const go = (q: { tipo?: string; de?: string; ate?: string }) => {
    const p = new URLSearchParams({ tipo: q.tipo ?? report.key, de: q.de ?? from, ate: q.ate ?? to });
    router.push(`${pathname}?${p}`);
  };
  const pdfHref = `/api/relatorios/pdf?${new URLSearchParams({ tipo: report.key, de: from, ate: to })}`;

  const columns: ColumnDef<ReportRow, unknown>[] = report.columns.map((c) => ({
    accessorKey: c.key,
    header: c.label,
    cell: ({ row }) => {
      const v = row.original[c.key];
      if (c.key === "classe" && typeof v === "string") return <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold", CLASS_TONE[v])}>{v}</span>;
      return <span className={cn(isNumeric(c.format) && "tabular", c.key === "lucro" && typeof v === "number" && v < 0 && "text-destructive")}>{formatCell(v, c.format)}</span>;
    },
    meta: { className: isNumeric(c.format) ? "text-right" : undefined },
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {reports.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => go({ tipo: r.key })}
            className={cn("rounded-full border px-3 py-1.5 text-sm", r.key === report.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              go({ de, ate });
            }}
          >
            <FormField label="De">
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
            </FormField>
            <FormField label="Até">
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
            </FormField>
            <Button type="submit" variant="outline">
              Aplicar
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5 lg:ml-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setDe(p.de);
                  setAte(p.ate);
                  go({ de: p.de, ate: p.ate });
                }}
                className={cn("rounded-full px-3 py-1.5 text-xs", p.de === from && p.ate === to ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button asChild className="lg:ml-auto">
            <a href={pdfHref} target="_blank" rel="noreferrer">
              <FileText /> PDF
            </a>
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">{report.title}</h2>
        <p className="text-sm text-muted-foreground">{report.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {report.summary.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-xl font-semibold tabular">{formatCell(s.value, s.format)}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={report.rows}
        pageSize={25}
        searchPlaceholder="Filtrar…"
        empty={<EmptyState icon={FileDown} title="Sem dados no período" description="Escolha outro período ou relatório." />}
        exportName={`relatorio-${report.key}-${from}-a-${to}`}
        exportDef={report.columns.map((c) => ({ header: c.format === "money" ? `${c.label} (R$)` : c.label, value: (r: ReportRow) => sheetValue(r[c.key], c.format) }))}
      />
    </div>
  );
}
