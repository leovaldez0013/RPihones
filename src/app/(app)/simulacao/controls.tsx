"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlaskConical, Loader2, LogOut, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteSimulationAction, generateSimulationAction, pauseSimulationAction, resumeSimulationAction } from "@/features/simulation/actions";

export function SimulationControls({ status }: { status: { supported: boolean; exists: boolean; active: boolean } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!status.supported) return null;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? "Erro");
    toast.success(success);
    router.refresh();
  }

  const generate = () => run("gen", () => generateSimulationAction({}), "Simulação de 1 mês gerada");

  return (
    <>
      {status.exists ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="lg" disabled={!!busy}>
              {busy === "gen" ? <Loader2 className="animate-spin" /> : <FlaskConical />} Gerar de novo
            </Button>
          }
          title="Gerar uma nova simulação?"
          description="A simulação atual é descartada e uma nova é criada. Os dados reais não são tocados."
          confirmLabel="Gerar nova"
          destructive={false}
          onConfirm={generate}
        />
      ) : (
        <Button size="lg" onClick={generate} disabled={!!busy}>
          {busy === "gen" ? <Loader2 className="animate-spin" /> : <FlaskConical />} {busy === "gen" ? "Gerando (até 1 min)…" : "Gerar simulação de 1 mês"}
        </Button>
      )}
      {status.exists && status.active && (
        <Button variant="outline" size="lg" disabled={!!busy} onClick={() => run("pause", () => pauseSimulationAction({}), "Voltou para os dados reais (simulação guardada)")}>
          <LogOut /> Voltar aos dados reais
        </Button>
      )}
      {status.exists && !status.active && (
        <Button size="lg" disabled={!!busy} onClick={() => run("resume", () => resumeSimulationAction({}), "Modo simulação ativado")}>
          <Play /> Voltar à simulação
        </Button>
      )}
      {status.exists && (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="lg" disabled={!!busy}>
              <Trash2 /> Apagar simulação
            </Button>
          }
          title="Apagar a simulação?"
          description="Remove só os dados simulados. O estoque, as vendas e as configurações reais continuam iguais."
          confirmLabel="Apagar simulação"
          onConfirm={() => run("del", () => deleteSimulationAction({}), "Simulação apagada — você está nos dados reais")}
        />
      )}
    </>
  );
}
