"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Bookmark, CheckCircle2, Loader2, MessageCircle, PackageCheck, ShoppingCart, Truck, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { ImeiField } from "@/components/shared/imei-field";
import { DEVICE_CONDITION } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { whatsappLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  cancelOrderAction,
  deliverOrderAction,
  registerArrivalAction,
  releaseOrderDeviceAction,
  reserveForOrderAction,
  setOrderStatusAction,
} from "@/features/orders/actions";

type Arrival = { capacities: string[]; colors: string[]; capacity: string; color: string; condition: string; price: number };

export function OrderActions({
  id,
  status,
  hasDevice,
  deposit,
  agreedPrice,
  devicePrice,
  arrival,
  canSell,
  whatsapp,
}: {
  id: string;
  status: string;
  hasDevice: boolean;
  deposit: number;
  agreedPrice: number | null;
  devicePrice: number | null;
  arrival: Arrival;
  canSell: boolean;
  whatsapp: { phone: string; message: string } | null;
}) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

  async function setStatus(s: string, msg: string) {
    const res = await setOrderStatusAction({ id, status: s as "EM_BUSCA" });
    if (!res.ok) return toast.error(res.error);
    toast.success(msg);
    router.refresh();
  }

  return (
    <>
      {status === "ABERTA" && (
        <Button variant="outline" size="lg" onClick={() => setStatus("EM_BUSCA", "Marcada como encomendada ao fornecedor")}>
          <Truck /> Marcar como encomendado
        </Button>
      )}
      {!hasDevice && (
        <Button size="lg" onClick={() => setArrivalOpen(true)}>
          <PackageCheck /> Registrar chegada
        </Button>
      )}
      {hasDevice && whatsapp && (
        <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => status !== "CLIENTE_AVISADO" && setStatus("CLIENTE_AVISADO", "Cliente avisado")}>
          <a href={whatsappLink(whatsapp.phone, whatsapp.message)} target="_blank" rel="noreferrer">
            <MessageCircle /> Avisar cliente
          </a>
        </Button>
      )}
      {hasDevice && canSell && (
        <Button size="lg" onClick={() => setDeliverOpen(true)}>
          <CheckCircle2 /> Entregar
        </Button>
      )}
      {hasDevice && canSell && (
        <Button asChild variant="outline" size="lg">
          <Link href={`/vendas/nova?encomenda=${id}`}>
            <ShoppingCart /> Entregar pelo PDV
          </Link>
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
      <Button variant="destructive" size="lg" onClick={() => setCancelOpen(true)}>
        <Ban /> Cancelar
      </Button>
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} id={id} deposit={deposit} />
      <ArrivalDialog open={arrivalOpen} onOpenChange={setArrivalOpen} id={id} arrival={arrival} />
      {devicePrice != null && <DeliverDialog open={deliverOpen} onOpenChange={setDeliverOpen} id={id} total={agreedPrice ?? devicePrice} deposit={deposit} />}
    </>
  );
}

function ArrivalDialog({ open, onOpenChange, id, arrival }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; arrival: Arrival }) {
  const router = useRouter();
  const [imei, setImei] = useState("");
  const [capacity, setCapacity] = useState(arrival.capacity || arrival.capacities[0] || "");
  const [color, setColor] = useState(arrival.color || arrival.colors[0] || "");
  const [condition, setCondition] = useState(arrival.condition);
  const [cost, setCost] = useState(0);
  const [price, setPrice] = useState(arrival.price);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar chegada do aparelho</DialogTitle>
          <DialogDescription>O aparelho entra no estoque já reservado para o cliente desta encomenda.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="IMEI (opcional)" className="sm:col-span-2">
            <ImeiField value={imei} onChange={setImei} />
          </FormField>
          <FormField label="Capacidade">
            <NativeSelect value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-9">
              {arrival.capacities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Cor">
            <NativeSelect value={color} onChange={(e) => setColor(e.target.value)} className="h-9">
              {arrival.colors.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Condição">
            <NativeSelect value={condition} onChange={(e) => setCondition(e.target.value)} className="h-9">
              {DEVICE_CONDITION.list.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Custo">
            <MoneyInput value={cost} onChange={setCost} />
          </FormField>
          <FormField label="Preço de venda" className="sm:col-span-2" hint="Sugestão: valor combinado na encomenda.">
            <MoneyInput value={price} onChange={setPrice} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            disabled={busy || !capacity || !color || price <= 0}
            onClick={async () => {
              setBusy(true);
              const res = await registerArrivalAction({ orderId: id, imei, capacity, color, condition: condition as "NOVO", batteryHealth: null, acquisitionCost: cost, salePrice: price });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success("Chegada registrada — aparelho reservado para o cliente");
              onOpenChange(false);
              router.refresh();
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Dar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const METHODS = [
  { value: "PIX", label: "PIX" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito à vista" },
  { value: "CREDITO_PARCELADO", label: "Crédito parcelado" },
] as const;

function DeliverDialog({ open, onOpenChange, id, total, deposit }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; total: number; deposit: number }) {
  const router = useRouter();
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("PIX");
  const [installments, setInstallments] = useState(3);
  const [busy, setBusy] = useState(false);
  const rest = Math.max(0, total - deposit);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entregar encomenda</DialogTitle>
          <DialogDescription>
            Gera a venda automaticamente: {formatBRL(total)}
            {deposit > 0 && ` − sinal ${formatBRL(deposit)}`} = <strong>{formatBRL(rest)}</strong> a receber.
          </DialogDescription>
        </DialogHeader>
        {rest > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn("h-11 rounded-xl border text-sm font-medium", method === m.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
              >
                {m.label}
              </button>
            ))}
            {method === "CREDITO_PARCELADO" && (
              <FormField label="Parcelas">
                <NativeSelect value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="h-9">
                  {[2, 3, 4, 5, 6, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await deliverOrderAction({ orderId: id, method, installments });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success(`Encomenda entregue — venda #${res.data.number}`);
              onOpenChange(false);
              router.push(`/vendas/${res.data.saleId}`);
              router.refresh();
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Confirmar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
