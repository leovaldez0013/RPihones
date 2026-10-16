"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Lock, LockOpen, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { PAYMENT_METHOD } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cashMovementAction, closeCashAction, openCashAction } from "@/features/finance/actions";

type Current = {
  id: string;
  openedAt: string;
  openingAmount: number;
  cashIn: number;
  suprimentos: number;
  sangrias: number;
  expectedCash: number;
  byMethod: Record<string, number>;
  movements: { id: string; type: string; amount: number; reason: string; createdAt: string }[];
};

type History = { id: string; user: string; openedAt: string; closedAt: string; opening: number; expected: number; counted: number; difference: number; notes: string };

export function CashPanel({ accounts, current, history }: { accounts: { id: string; name: string }[]; current: Current | null; history: History[] }) {
  const router = useRouter();
  const [opening, setOpening] = useState(0);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState<"SANGRIA" | "SUPRIMENTO" | null>(null);
  const [closing, setClosing] = useState(false);

  async function open() {
    setBusy(true);
    const res = await openCashAction({ accountId, openingAmount: opening });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Caixa aberto");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        {!current ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LockOpen className="size-4" /> Abrir caixa
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3 sm:items-end">
              <FormField label="Caixa">
                <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Troco inicial (fundo de caixa)">
                <MoneyInput value={opening} onChange={setOpening} />
              </FormField>
              <Button size="lg" onClick={open} disabled={busy || !accountId}>
                {busy ? <Loader2 className="animate-spin" /> : <LockOpen />} Abrir caixa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="size-4" /> Caixa aberto desde {formatDateTime(current.openedAt)}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMove("SUPRIMENTO")}>
                    <ArrowDownToLine /> Suprimento
                  </Button>
                  <Button variant="outline" onClick={() => setMove("SANGRIA")}>
                    <ArrowUpFromLine /> Sangria
                  </Button>
                  <Button onClick={() => setClosing(true)}>
                    <Lock /> Fechar caixa
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 p-4 text-sm">
                  <p className="mb-1 font-medium">Dinheiro na gaveta</p>
                  <Line label="Fundo inicial" value={current.openingAmount} />
                  <Line label="Recebido em dinheiro" value={current.cashIn} />
                  <Line label="Suprimentos" value={current.suprimentos} />
                  <Line label="Sangrias" value={-current.sangrias} />
                  <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
                    <span>Esperado</span>
                    <span className="tabular">{formatBRL(current.expectedCash)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 p-4 text-sm">
                  <p className="mb-1 font-medium">Recebido no turno por forma (conferência)</p>
                  {Object.keys(current.byMethod).length === 0 && <p className="text-muted-foreground">Nenhum recebimento ainda.</p>}
                  {Object.entries(current.byMethod).map(([m, v]) => (
                    <Line key={m} label={PAYMENT_METHOD.label(m)} value={v} />
                  ))}
                </div>
              </CardContent>
            </Card>
            {current.movements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Movimentações do turno</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {current.movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        <StatusBadge tone={m.type === "SANGRIA" ? "amber" : "blue"}>{m.type === "SANGRIA" ? "Sangria" : "Suprimento"}</StatusBadge> {m.reason}
                        <span className="block text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                      </span>
                      <span className="font-medium tabular">{formatBRL(m.amount)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Fechamentos anteriores</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {history.length === 0 ? (
            <EmptyState title="Nenhum fechamento" className="py-6" />
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{h.user}</span>
                  <span className={cn("font-semibold tabular", h.difference === 0 ? "text-emerald-600" : h.difference < 0 ? "text-red-600" : "text-amber-600")}>
                    {h.difference === 0 ? "conferido" : `${h.difference > 0 ? "+" : ""}${formatBRL(h.difference)}`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(h.openedAt)} → {formatDateTime(h.closedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  esperado {formatBRL(h.expected)} · contado {formatBRL(h.counted)}
                </p>
                {h.notes && <p className="mt-1 text-xs">{h.notes}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {current && (
        <>
          <MoveDialog type={move} onClose={() => setMove(null)} sessionId={current.id} />
          <CloseDialog open={closing} onClose={() => setClosing(false)} current={current} />
        </>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{formatBRL(value)}</span>
    </div>
  );
}

function MoveDialog({ type, onClose, sessionId }: { type: "SANGRIA" | "SUPRIMENTO" | null; onClose: () => void; sessionId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{type === "SANGRIA" ? "Sangria" : "Suprimento"}</DialogTitle>
          <DialogDescription>{type === "SANGRIA" ? "Retirada de dinheiro da gaveta (vai para o banco/cofre)." : "Entrada de dinheiro na gaveta (troco)."}</DialogDescription>
        </DialogHeader>
        <FormField label="Valor">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </FormField>
        <FormField label="Motivo">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "SANGRIA" ? "Depósito no banco" : "Troco"} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await cashMovementAction({ sessionId, type: type!, amount, reason });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success("Movimentação registrada");
              setAmount(0);
              setReason("");
              router.refresh();
              onClose();
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ open, onClose, current }: { open: boolean; onClose: () => void; current: Current }) {
  const router = useRouter();
  const [counted, setCounted] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = counted - current.expectedCash;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
          <DialogDescription>Conte o dinheiro da gaveta e informe o valor. Cartões e PIX são conferidos pelo relatório da maquininha/extrato.</DialogDescription>
        </DialogHeader>
        <FormField label="Dinheiro contado na gaveta">
          <MoneyInput value={counted} onChange={setCounted} autoFocus className="h-10 text-base" />
        </FormField>
        <div className={cn("rounded-xl p-3 text-sm", diff === 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>
          Esperado {formatBRL(current.expectedCash)} · diferença <strong className="tabular">{formatBRL(diff)}</strong>
        </div>
        <FormField label="Observações">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Justifique diferenças, se houver" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await closeCashAction({ sessionId: current.id, counted, notes });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success(res.data.difference === 0 ? "Caixa fechado e conferido" : `Caixa fechado com diferença de ${formatBRL(res.data.difference)}`);
              router.refresh();
              onClose();
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Fechar caixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
