"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteDevice } from "@/features/devices/actions";

export function DeleteDeviceButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size="icon-lg" aria-label="Excluir">
          <Trash2 />
        </Button>
      }
      title="Excluir aparelho do estoque?"
      description="O registro fica guardado no histórico e no log de auditoria, mas deixa de aparecer no estoque."
      askReason="Motivo (ex.: cadastrado em duplicidade)"
      confirmLabel="Excluir"
      onConfirm={async (reason) => {
        const res = await deleteDevice({ id, reason });
        if (!res.ok) return toast.error(res.error);
        toast.success("Aparelho excluído");
        router.push("/estoque/aparelhos");
        router.refresh();
      }}
    />
  );
}
