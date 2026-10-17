"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/domain/money";
import { cn } from "@/lib/utils";
import { deliverServiceOrderAction } from "@/features/service-orders/actions";

const METHODS = [
  { value: "PIX", label: "PIX" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito" },
  { value: "A_RECEBER", label: "Fica a receber" },
] as const;

/** Conclui a OS. Cliente: escolhe como recebeu. Interna: o custo vai para o aparelho. */
export function DeliverDialog({
  so,
  open,
  onOpenChange,
  onDone,
}: {
  so: { id: string; number: number; kind: string; price: number } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("PIX");
  const [busy, setBusy] = useState(false);
  if (!so) return null;
  const charge = so.kind === "CLIENTE" && so.price > 0;

  async function confirm() {
    if (!so) return;
    setBusy(true);
    const res = await deliverServiceOrderAction({ id: so.id, method: charge ? method : undefined });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(so.kind === "INTERNA" ? `OS #${so.number} concluída — aparelho de volta ao estoque` : `OS #${so.number} entregue ao cliente`);
    onOpenChange(false);
    onDone?.();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{so.kind === "INTERNA" ? `Concluir OS #${so.number}` : `Entregar OS #${so.number}`}</DialogTitle>
          <DialogDescription>
            {so.kind === "INTERNA"
              ? "A mão de obra e as peças usadas serão somadas ao custo real do aparelho, que volta para “Em estoque”."
              : charge
                ? `Valor cobrado: ${formatBRL(so.price)}. Um comprovante de entrega será gerado.`
                : "Sem valor cobrado (garantia ou cortesia). Um comprovante de entrega será gerado."}
          </DialogDescription>
        </DialogHeader>
        {charge && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn(
                  "h-11 rounded-xl border text-sm font-medium transition",
                  method === m.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  m.value === "A_RECEBER" && "col-span-2 sm:col-span-2",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {so.kind === "INTERNA" ? "Concluir" : "Confirmar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
