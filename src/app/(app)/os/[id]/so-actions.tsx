"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/shared/inputs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SO_STATUS } from "@/domain/constants";
import { SO_BOARD } from "@/domain/service-order";
import { cancelServiceOrderAction, moveServiceOrderAction } from "@/features/service-orders/actions";
import { DeliverDialog } from "../deliver-dialog";

export function SoActions({ so }: { so: { id: string; number: number; kind: string; price: number; status: string } }) {
  const router = useRouter();
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <>
      <NativeSelect
        aria-label="Mover para"
        value={so.status}
        className="h-10 w-auto"
        onChange={async (e) => {
          const res = await moveServiceOrderAction({ id: so.id, status: e.target.value as "ABERTA", index: 0 });
          if (!res.ok) return toast.error(res.error);
          toast.success(`Movida para ${SO_STATUS.label(e.target.value)}`);
          router.refresh();
        }}
      >
        {SO_BOARD.map((s) => (
          <option key={s} value={s}>
            {SO_STATUS.label(s)}
          </option>
        ))}
      </NativeSelect>
      <Button variant="destructive" size="lg" onClick={() => setCancelOpen(true)}>
        <Ban /> Cancelar
      </Button>
      <Button size="lg" onClick={() => setDeliverOpen(true)}>
        <CheckCircle2 /> {so.kind === "INTERNA" ? "Concluir" : "Entregar"}
      </Button>
      <DeliverDialog so={so} open={deliverOpen} onOpenChange={setDeliverOpen} />
      <CancelDialog id={so.id} open={cancelOpen} onOpenChange={setCancelOpen} />
    </>
  );
}

function CancelDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar OS</DialogTitle>
          <DialogDescription>As peças usadas voltam ao estoque e o aparelho da loja volta a ficar disponível.</DialogDescription>
        </DialogHeader>
        <Textarea placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const res = await cancelServiceOrderAction({ id, reason });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success("OS cancelada");
              onOpenChange(false);
              router.refresh();
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Cancelar OS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
