"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cancelQuoteAction, cancelSaleAction } from "@/features/sales/actions";

export function SaleActions({
  id,
  status,
  canCancel,
  canEditQuote,
}: {
  id: string;
  status: string;
  canCancel: boolean;
  canEditQuote: boolean;
  customerPhone: string | null;
  customerName: string | null;
}) {
  const router = useRouter();

  if (status === "ORCAMENTO") {
    return (
      <>
        {canEditQuote && (
          <Button asChild size="lg">
            <Link href={`/vendas/nova?orcamento=${id}`}>
              <Pencil /> Editar / finalizar
            </Link>
          </Button>
        )}
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="lg">
              <Ban /> Cancelar orçamento
            </Button>
          }
          title="Cancelar orçamento?"
          description="Os aparelhos reservados voltam a ficar disponíveis."
          askReason="Motivo"
          onConfirm={async (reason) => {
            const res = await cancelQuoteAction({ id, reason });
            if (!res.ok) return toast.error(res.error);
            toast.success("Orçamento cancelado");
            router.refresh();
          }}
        />
      </>
    );
  }

  if (status !== "CONCLUIDA" || !canCancel) return null;

  return (
    <>
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="lg">
            <Undo2 /> Devolução
          </Button>
        }
        title="Registrar devolução?"
        description="Os itens voltam ao estoque, os recebimentos são estornados e o aparelho de troca é devolvido ao cliente (ou reembolsado, se já foi vendido)."
        askReason="Motivo da devolução"
        confirmLabel="Registrar devolução"
        onConfirm={async (reason) => {
          const res = await cancelSaleAction({ id, type: "DEVOLUCAO", reason });
          if (!res.ok) return toast.error(res.error);
          toast.success("Devolução registrada e financeiro estornado");
          router.refresh();
        }}
      />
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="lg">
            <Ban /> Cancelar venda
          </Button>
        }
        title="Cancelar esta venda?"
        description="Use para vendas lançadas por engano. Estoque e financeiro são revertidos e tudo fica no log de auditoria."
        askReason="Motivo do cancelamento"
        confirmLabel="Cancelar venda"
        onConfirm={async (reason) => {
          const res = await cancelSaleAction({ id, type: "CANCELAMENTO", reason });
          if (!res.ok) return toast.error(res.error);
          toast.success("Venda cancelada");
          router.refresh();
        }}
      />
    </>
  );
}
