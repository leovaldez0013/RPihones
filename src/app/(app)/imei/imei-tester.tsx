"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ScanLine, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImeiField } from "@/components/shared/imei-field";
import { ImeiVerdictBanner } from "@/components/imei/imei-result";
import { checkImeiAction } from "@/features/imei/actions";
import type { ImeiCheckResult } from "@/features/imei/service";

export function ImeiTester({
  defaultImei,
  deviceId,
  provider,
  canConfigure,
}: {
  defaultImei: string;
  deviceId: string | null;
  provider: { id: string; label: string };
  canConfigure: boolean;
}) {
  const router = useRouter();
  const [imei, setImei] = useState(defaultImei);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImeiCheckResult | null>(null);
  const digits = imei.replace(/\D/g, "");

  async function check() {
    setBusy(true);
    const res = await checkImeiAction({ imei: digits, deviceId: deviceId && digits === defaultImei ? deviceId : null });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setResult(res.data);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (digits.length === 15) check();
            }}
            className="flex flex-col gap-3"
          >
            <ImeiField value={imei} onChange={(v) => (setImei(v), setResult(null))} existingIsInfo autoFocus />
            <Button type="submit" size="lg" className="h-11" disabled={busy || digits.length !== 15}>
              {busy ? <Loader2 className="animate-spin" /> : <ScanLine />} Consultar
            </Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Serviço de consulta: <strong className="text-foreground">{provider.label}</strong>
            </span>
            {canConfigure && (
              <Link href="/configuracoes/geral" className="inline-flex items-center gap-1 hover:text-foreground">
                <Settings2 className="size-3.5" /> Configurar
              </Link>
            )}
          </div>
          {provider.id === "mock" && (
            <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              Modo demonstração: os resultados são simulados. Para testar, IMEIs com penúltimo dígito 9 aparecem bloqueados e com 8 com Buscar iPhone ativo.
            </p>
          )}
        </CardContent>
      </Card>
      {result && <ImeiVerdictBanner result={result} />}
      <p className="text-xs text-muted-foreground">Dica: no aparelho, disque *#06# para ver o IMEI, ou use o leitor/câmera no botão ao lado do campo.</p>
    </div>
  );
}
