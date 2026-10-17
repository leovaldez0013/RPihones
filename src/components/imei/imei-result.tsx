"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MapPinned, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEVICE_STATUS } from "@/domain/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { checkImeiAction } from "@/features/imei/actions";
import type { ImeiCheckResult, ImeiVerdict } from "@/features/imei/service";

const VERDICT: Record<ImeiVerdict, { title: string; text: string; icon: typeof ShieldCheck; box: string; iconBox: string }> = {
  BLOQUEADO: {
    title: "IMEI BLOQUEADO",
    text: "Consta em lista de bloqueio (perda, roubo ou inadimplência). Não compre, não receba na troca e não venda este aparelho.",
    icon: ShieldAlert,
    box: "border-red-500 bg-red-500/10 text-red-900 dark:text-red-100",
    iconBox: "bg-red-600 text-white",
  },
  ATENCAO: {
    title: "Buscar iPhone ativo",
    text: "O aparelho ainda está vinculado a uma conta iCloud. Peça ao cliente para remover antes de concluir.",
    icon: MapPinned,
    box: "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-100",
    iconBox: "bg-amber-500 text-white",
  },
  LIVRE: {
    title: "Sem restrição",
    text: "Nenhum bloqueio encontrado na consulta.",
    icon: ShieldCheck,
    box: "border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
    iconBox: "bg-emerald-600 text-white",
  },
  LOCAL: {
    title: "Validação local OK",
    text: "Número válido. Sem serviço de consulta configurado, o bloqueio não foi verificado.",
    icon: ShieldQuestion,
    box: "border-border bg-muted/50",
    iconBox: "bg-muted-foreground text-background",
  },
};

export function ImeiVerdictBanner({ result, compact }: { result: ImeiCheckResult; compact?: boolean }) {
  const v = VERDICT[result.verdict];
  const Icon = v.icon;
  const rows = [
    ["Modelo (TAC)", result.tacModel ?? result.report.model],
    ["Operadora", result.report.carrier],
    ["Bloqueio de operadora", result.report.simLock],
    ["Garantia", result.report.warranty],
  ].filter(([, val]) => val) as [string, string][];
  return (
    <div role={result.verdict === "BLOQUEADO" ? "alert" : "status"} className={cn("rounded-2xl border-2 p-4", v.box, compact && "p-3")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex shrink-0 items-center justify-center rounded-full", v.iconBox, compact ? "size-8" : "size-11")}>
          <Icon className={compact ? "size-4" : "size-6"} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-lg")}>{v.title}</p>
          <p className={cn("opacity-90", compact ? "text-xs" : "text-sm")}>{v.text}</p>
          {result.provider === "mock" && <p className="mt-1 text-xs opacity-70">Resultado simulado (modo demonstração).</p>}
        </div>
      </div>
      {!compact && (
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs opacity-70">IMEI</dt>
            <dd className="font-mono">{result.imei}</dd>
          </div>
          {rows.map(([k, val]) => (
            <div key={k}>
              <dt className="text-xs opacity-70">{k}</dt>
              <dd>{val}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs opacity-70">Consultado em</dt>
            <dd>{formatDateTime(result.createdAt)}</dd>
          </div>
          {result.device && (
            <div>
              <dt className="text-xs opacity-70">No sistema</dt>
              <dd>
                <Link href={`/estoque/aparelhos/${result.device.id}`} className="underline">
                  {result.device.name}
                </Link>{" "}
                ({DEVICE_STATUS.label(result.device.status)})
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/** Botão “Consultar bloqueio” embutido nos formulários (cadastro, troca, compra de usado). */
export function ImeiCheckButton({ imei, deviceId, onResult }: { imei: string; deviceId?: string | null; onResult?: (r: ImeiCheckResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImeiCheckResult | null>(null);
  const digits = imei.replace(/\D/g, "");
  const current = result && result.imei === digits ? result : null;

  return (
    <div className="flex flex-col gap-2">
      {!current && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={busy || digits.length !== 15}
          onClick={async () => {
            setBusy(true);
            const res = await checkImeiAction({ imei: digits, deviceId });
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            setResult(res.data);
            onResult?.(res.data);
            if (res.data.verdict === "BLOQUEADO") toast.error("IMEI BLOQUEADO — não receba este aparelho.");
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Consultar bloqueio
        </Button>
      )}
      {current && <ImeiVerdictBanner result={current} compact />}
    </div>
  );
}
