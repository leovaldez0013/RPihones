"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2, PackageCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField, NativeSelect } from "@/components/shared/inputs";
import { ImeiField } from "@/components/shared/imei-field";
import { formatBRL } from "@/domain/money";
import { GRADES } from "@/domain/constants";
import { cancelPurchaseAction, placePurchaseAction, receivePurchaseAction } from "@/features/purchases/actions";

type Pending = { id: string; kind: "DEVICE" | "ACCESSORY"; description: string; condition: string | null; color: string | null; remaining: number; unitCost: number; colors: string[] };
type DeviceRow = { imei: string; batteryHealth: string; grade: string; color: string };

export function PurchaseActions({
  id,
  status,
  canCancel,
  pending,
  dueDate,
  accounts,
}: {
  id: string;
  status: string;
  canCancel: boolean;
  pending: Pending[];
  dueDate: string;
  accounts: { id: string; name: string; kind: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function place() {
    setBusy(true);
    const res = await placePurchaseAction({ id });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pedido marcado como enviado ao fornecedor");
    router.refresh();
  }

  return (
    <>
      {status === "RASCUNHO" && (
        <Button variant="outline" size="lg" onClick={place} disabled={busy}>
          <Send /> Marcar como pedido feito
        </Button>
      )}
      {pending.length > 0 && status !== "CANCELADO" && (
        <Button size="lg" onClick={() => setOpen(true)}>
          <PackageCheck /> Receber mercadoria
        </Button>
      )}
      {canCancel && (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="lg">
              <Ban /> Cancelar
            </Button>
          }
          title="Cancelar este pedido?"
          askReason="Motivo do cancelamento"
          confirmLabel="Cancelar pedido"
          onConfirm={async (reason) => {
            const res = await cancelPurchaseAction({ id, reason });
            if (!res.ok) return toast.error(res.error);
            toast.success("Pedido cancelado");
            router.refresh();
          }}
        />
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Receber mercadoria</DialogTitle>
            <DialogDescription>Informe o que chegou. Aparelhos entram pelo IMEI; o que faltar fica pendente para um próximo recebimento.</DialogDescription>
          </DialogHeader>
          {open && (
            <ReceiveForm
              id={id}
              pending={pending}
              dueDate={dueDate}
              accounts={accounts}
              onDone={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReceiveForm({
  id,
  pending,
  dueDate: initialDue,
  accounts,
  onDone,
}: {
  id: string;
  pending: Pending[];
  dueDate: string;
  accounts: { id: string; name: string; kind: string }[];
  onDone: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(pending.map((p) => [p.id, p.kind === "ACCESSORY" ? p.remaining : 0])));
  const [devices, setDevices] = useState<Record<string, DeviceRow[]>>(
    Object.fromEntries(pending.filter((p) => p.kind === "DEVICE").map((p) => [p.id, Array.from({ length: p.remaining }, () => ({ imei: "", batteryHealth: p.condition === "NOVO" ? "100" : "", grade: p.condition === "NOVO" ? "A+" : "", color: p.color ?? "" }))])),
  );
  const [dueDate, setDueDate] = useState(initialDue || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [paid, setPaid] = useState(false);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === "BANCO")?.id ?? "");
  const [saving, setSaving] = useState(false);

  const filledDevices = (itemId: string) => (devices[itemId] ?? []).filter((d) => d.imei.length === 15);
  const units = pending.reduce((a, p) => a + (p.kind === "DEVICE" ? filledDevices(p.id).length : qty[p.id] ?? 0), 0);
  const value = pending.reduce((a, p) => a + (p.kind === "DEVICE" ? filledDevices(p.id).length : qty[p.id] ?? 0) * p.unitCost, 0);

  function setDevice(itemId: string, idx: number, patch: Partial<DeviceRow>) {
    setDevices((all) => ({ ...all, [itemId]: all[itemId].map((d, i) => (i === idx ? { ...d, ...patch } : d)) }));
  }

  async function submit() {
    const noColor = pending.some((p) => p.kind === "DEVICE" && filledDevices(p.id).some((d) => !d.color));
    if (noColor) return toast.error("Informe a cor de cada aparelho recebido.");
    setSaving(true);
    const res = await receivePurchaseAction({
      purchaseId: id,
      dueDate,
      paid,
      accountId: paid ? accountId : null,
      items: pending.map((p) => ({
        itemId: p.id,
        quantity: p.kind === "ACCESSORY" ? qty[p.id] ?? 0 : 0,
        devices:
          p.kind === "DEVICE"
            ? filledDevices(p.id).map((d) => ({ imei: d.imei, batteryHealth: d.batteryHealth, grade: d.grade as "A", color: d.color }))
            : [],
      })),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${res.data.units} item(ns) recebido(s) — conta a pagar de ${formatBRL(res.data.receivedValue)} gerada`);
    onDone();
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto px-1">
      {pending.map((p) => (
        <div key={p.id} className="rounded-2xl border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-medium">{p.description}</p>
            <span className="text-xs text-muted-foreground">faltam {p.remaining}</span>
          </div>
          {p.kind === "ACCESSORY" ? (
            <FormField label="Quantidade recebida agora">
              <Input type="number" min={0} max={p.remaining} value={qty[p.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [p.id]: Math.min(p.remaining, Math.max(0, Number(e.target.value) || 0)) }))} className="w-32" />
            </FormField>
          ) : (
            <div className="flex flex-col gap-3">
              {devices[p.id].map((d, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_130px_90px_80px]">
                  <ImeiField id={`imei-${p.id}-${idx}`} value={d.imei} onChange={(v) => setDevice(p.id, idx, { imei: v })} />
                  <NativeSelect value={d.color} onChange={(e) => setDevice(p.id, idx, { color: e.target.value })} className="h-8">
                    <option value="">Cor…</option>
                    {p.colors.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </NativeSelect>
                  <Input placeholder="Bateria %" type="number" value={d.batteryHealth} onChange={(e) => setDevice(p.id, idx, { batteryHealth: e.target.value })} />
                  <NativeSelect value={d.grade} onChange={(e) => setDevice(p.id, idx, { grade: e.target.value })} className="h-8">
                    <option value="">Grade</option>
                    {GRADES.list.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.value}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Deixe em branco os aparelhos que ainda não chegaram.</p>
            </div>
          )}
        </div>
      ))}

      <div className="grid gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-2">
        <FormField label="Vencimento da conta a pagar">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={paid} onCheckedChange={setPaid} /> Já foi pago
          </label>
          {paid && (
            <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
      </div>

      <DialogFooter className="sticky bottom-0 items-center bg-background pt-2">
        <span className="mr-auto text-sm">
          Valor recebido agora: <strong className="tabular">{formatBRL(value)}</strong>
        </span>
        <Button onClick={submit} disabled={saving || units === 0}>
          {saving && <Loader2 className="animate-spin" />} Confirmar recebimento
        </Button>
      </DialogFooter>
    </div>
  );
}
