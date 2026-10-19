"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/format";
import { runAppTestAction } from "@/features/simulation/actions";
import type { TestReport } from "@/features/simulation/selftest";

export function TestReportCard({ report, canRun }: { report: TestReport | null; canRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const groups = report ? [...new Set(report.items.map((i) => i.group))] : [];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" /> Teste do app
          {report && (
            <StatusBadge tone={report.failed ? "red" : "green"}>
              {report.ok} OK{report.failed ? ` · ${report.failed} com erro` : ""}
            </StatusBadge>
          )}
        </CardTitle>
        {canRun && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await runAppTestAction({});
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              if (res.data.failed) toast.error(`Teste concluído: ${res.data.failed} item(ns) com erro`);
              else toast.success(`Teste concluído: ${res.data.ok} itens OK`);
              router.refresh();
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ClipboardCheck />} {busy ? "Testando (1–2 min)…" : "Rodar teste completo"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!report ? (
          <p className="text-sm text-muted-foreground">
            O teste gera uma simulação, exercita cada função (estoque, vendas, OS, encomendas, garantias), confere o painel com a soma dos registros, apaga a simulação para provar que os dados reais não mudaram e gera uma simulação nova e limpa para você explorar.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Executado em {formatDateTime(report.finishedAt)}</p>
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1.5 text-sm font-semibold">{g}</p>
                <ul className="divide-y rounded-xl border">
                  {report.items
                    .filter((i) => i.group === g)
                    .map((i) => (
                      <li key={i.name} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                        {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{i.name}</span>
                          <span className={`block text-xs ${i.ok ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>{i.detail}</span>
                        </span>
                        <StatusBadge tone={i.ok ? "green" : "red"}>{i.ok ? "OK" : "Erro"}</StatusBadge>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
