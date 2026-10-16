"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Bookmark, Loader2, MessageCircle, Search, ShoppingCart, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/domain/money";
import { whatsappLink } from "@/lib/format";
import { cancelOrderAction, releaseOrderDeviceAction, reserveForOrderAction, setOrderStatusAction } from "@/features/orders/actions";

export function OrderActions({
  id,
  status,
  hasDevice,
  deposit,
  canSell,
  whatsapp,
}: {
  id: string;
  status: string;
  hasDevice: boolean;
  deposit: number;
  canSell: boolean;
  whatsapp: { phone: string; message: string } | null;
}) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);

  async function setStatus(s: string, msg: string) {
    const res = await setOrderStatusAction({ id, status: s as "EM_BUSCA" });
    if (!res.ok) return toast.error(res.error);
    toast.success(msg);
    router.refresh();
  }

  return (
    <>
      {status === "ABERTA" && (
        <Button variant="outline" size="lg" onClick={() => setStatus("EM_BUSCA", "Marcada como em busca")}>
          <Search /> Em busca
        </Button>
      )}
      {hasDevice && whatsapp && (
        <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => status !== "CLIENTE_AVISADO" && setStatus("CLIENTE_AVISADO", "Cliente avisado")}>
          <a href={whatsappLink(whatsapp.phone, whatsapp.message)} target="_blank" rel="noreferrer">
            <MessageCircle /> Avisar cliente
          </a>
        </Button>
      )}
      {hasDevice && (
        <Button
          variant="outline"
          size="lg"
          onClick={async () => {
            const res = await releaseOrderDeviceAction({ orderId: id });
            if (!res.ok) return toast.error(res.error);
            toast.success("Reserva liberada");
            router.refresh();
          }}
        >
          <Unlink /> Liberar reserva
        </Button>
      )}
      {hasDevice && canSell && (
        <Button asChild size="lg">
          <Link href={`/vendas/nova?encomenda=${id}`}>
            <ShoppingCart /> Vender e entregar
          </Link>
        </Button>
      )}
      <Button variant="destructive" size="lg" onClick={() => setCancelOpen(true)}>
        <Ban /> Cancelar
      </Button>
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} id={id} deposit={deposit} />
    </>
  );
}

function CancelDialog({ open, onOpenChange, id, deposit }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; deposit: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar encomenda</DialogTitle>
          <DialogDescription>A reserva do aparelho é liberada.</DialogDescription>
        </DialogHeader>
        <Textarea placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        {deposit > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={refund} onCheckedChange={setRefund} /> Devolver o sinal de {formatBRL(deposit)} (gera saída no financeiro)
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const res = await cancelOrderAction({ id, reason, refund: deposit > 0 && refund });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success("Encomenda cancelada");
              onOpenChange(false);
              router.refresh();
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Cancelar encomenda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

OrderActions.Reserve = function Reserve({ orderId, deviceId }: { orderId: string; deviceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await reserveForOrderAction({ orderId, deviceId });
        setBusy(false);
        if (!res.ok) return toast.error(res.error);
        toast.success("Aparelho reservado para a encomenda");
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Bookmark />} Reservar
    </Button>
  );
};
