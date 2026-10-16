"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BadgePercent, FileText, Headphones, Loader2, Minus, Pencil, Plus, Repeat, ScanLine, Search, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { BarcodeScannerButton } from "@/components/shared/barcode-scanner";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerPicker, type PickedCustomer } from "@/components/forms/customer-picker";
import { DEVICE_CONDITION } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import type { CardFeeRule } from "@/domain/installments";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/features/devices/queries";
import { saveSaleAction, searchSellables, type Sellable } from "@/features/sales/actions";
import { TradeInDialog, type TradeInDraft } from "./trade-in-dialog";
import { PaymentsPanel, paymentInterest, type PaymentDraft } from "./payments-panel";

export type CartLine = {
  key: string;
  kind: "DEVICE" | "ACCESSORY" | "SERVICE";
  refId: string;
  title: string;
  subtitle: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  stock?: number;
};

type Props = {
  cardRules: CardFeeRule[];
  catalog: CatalogItem[];
  sellers: { id: string; name: string }[];
  currentUserId: string;
  discountLimitPct: number;
  customer: PickedCustomer | null;
  quote: {
    id: string;
    number: number;
    sellerId: string;
    discount: number;
    notes: string;
    items: Omit<CartLine, "key">[];
    tradeIns: TradeInDraft[];
  } | null;
};

export function Pos({ cardRules, catalog, sellers, currentUserId, discountLimitPct, customer: initialCustomer, quote }: Props) {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [sellerId, setSellerId] = useState(quote?.sellerId ?? currentUserId);
  const [lines, setLines] = useState<CartLine[]>(() => (quote?.items ?? []).map((i, idx) => ({ ...i, key: `q${idx}` })));
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  const [tradeIns, setTradeIns] = useState<TradeInDraft[]>(quote?.tradeIns ?? []);
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [tradeOpen, setTradeOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeInDraft | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMsg, setApprovalMsg] = useState("");
  const [saving, setSaving] = useState<null | "ORCAMENTO" | "CONCLUIR">(null);

  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
  const itemDiscount = lines.reduce((a, l) => a + l.discount, 0);
  const total = Math.max(0, subtotal - itemDiscount - discount);
  const tradeTotal = tradeIns.reduce((a, t) => a + t.finalValue, 0);
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const remaining = total - tradeTotal - paid;
  const interest = payments.reduce((a, p) => a + paymentInterest(p, cardRules), 0);
  const discountPct = subtotal ? ((itemDiscount + discount) / subtotal) * 100 : 0;
  const overLimit = discountPct > discountLimitPct + 0.001;

  // pagamentos que excedem o novo total (ex.: removeu item) são descartados
  useEffect(() => {
    if (remaining < 0 && payments.length) setPayments([]);
  }, [remaining, payments.length]);

  function addSellable(s: Sellable) {
    if (s.type === "DEVICE") {
      if (s.reservedForOther) return toast.error("Este aparelho está reservado para outro cliente.");
      if (lines.some((l) => l.kind === "DEVICE" && l.refId === s.id)) return toast.info("Este aparelho já está no carrinho.");
      setLines((ls) => [...ls, { key: `d${s.id}`, kind: "DEVICE", refId: s.id, title: s.title, subtitle: s.subtitle, unitPrice: s.price, quantity: 1, discount: 0 }]);
    } else {
      if (s.stock <= 0) return toast.error(`"${s.title}" sem estoque.`);
      const existing = lines.find((l) => l.kind === "ACCESSORY" && l.refId === s.id);
      if (existing) {
        if (existing.quantity >= s.stock) return toast.error(`Só há ${s.stock} em estoque.`);
        setLines((ls) => ls.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l)));
      } else {
        setLines((ls) => [...ls, { key: `a${s.id}`, kind: "ACCESSORY", refId: s.id, title: s.title, subtitle: s.subtitle, unitPrice: s.price, quantity: 1, discount: 0, stock: s.stock }]);
      }
    }
    toast.success(`${s.title} adicionado`, { duration: 1200 });
  }

  async function submit(actionType: "ORCAMENTO" | "CONCLUIR", approval?: { email: string; password: string }) {
    if (!lines.length) return toast.error("Adicione itens ao carrinho.");
    if (actionType === "CONCLUIR" && remaining !== 0) return toast.error(remaining > 0 ? `Falta receber ${formatBRL(remaining)}.` : "Pagamentos maiores que o total.");
    setSaving(actionType);
    const res = await saveSaleAction({
      id: quote?.id,
      action: actionType,
      customerId: customer?.id ?? null,
      sellerId,
      items: lines.map((l) => ({
        kind: l.kind,
        deviceId: l.kind === "DEVICE" ? l.refId : null,
        accessoryId: l.kind === "ACCESSORY" ? l.refId : null,
        description: l.kind === "SERVICE" ? l.title : null,
        quantity: l.quantity,
        unitPrice: l.kind === "SERVICE" ? l.unitPrice : undefined,
        discount: l.discount,
      })),
      discount,
      tradeIns: tradeIns.map((t) => ({ ...t, grade: t.grade as "A" })),
      payments: actionType === "CONCLUIR" ? payments.map((p) => ({ method: p.method as "PIX", amount: p.amount, installments: p.installments, accountId: p.accountId ?? null })) : [],
      notes,
      approval: approval ?? null,
    });
    setSaving(null);
    if (!res.ok) {
      if (res.code === "DISCOUNT_APPROVAL") {
        setApprovalMsg(res.error);
        setApprovalOpen(true);
        return;
      }
      return toast.error(res.error);
    }
    setApprovalOpen(false);
    toast.success(res.data.status === "CONCLUIDA" ? `Venda #${res.data.number} concluída!` : `Orçamento #${res.data.number} salvo`);
    router.push(`/vendas/${res.data.id}${res.data.status === "CONCLUIDA" ? "?concluida=1" : ""}`);
  }

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ESQUERDA: busca + carrinho */}
      <div className="flex min-w-0 flex-col gap-4">
        <SellableSearch onPick={addSellable} customerId={customer?.id} saleId={quote?.id} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Carrinho {lines.length > 0 && <span className="text-muted-foreground">({lines.reduce((a, l) => a + l.quantity, 0)})</span>}</CardTitle>
            {overLimit && (
              <StatusBadge tone="amber">
                <BadgePercent className="size-3" /> desconto {discountPct.toFixed(1).replace(".", ",")}% — exige gerente
              </StatusBadge>
            )}
          </CardHeader>
          <CardContent className="@container flex flex-col gap-2">
            {lines.length === 0 ? (
              <EmptyState icon={ScanLine} title="Carrinho vazio" description="Escaneie o IMEI ou o código de barras, ou busque pelo nome do modelo/acessório." className="py-8" />
            ) : (
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.div
                    key={l.key}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex flex-col gap-2 rounded-2xl border p-3 @xl:flex-row @xl:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                        {l.kind === "DEVICE" ? <Smartphone className="size-5" /> : <Headphones className="size-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{l.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {l.kind === "ACCESSORY" && (
                        <div className="flex items-center rounded-lg border">
                          <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))} aria-label="Diminuir">
                            <Minus />
                          </Button>
                          <span className="w-6 text-center text-sm tabular">{l.quantity}</span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              if (l.stock != null && l.quantity >= l.stock) return toast.error(`Só há ${l.stock} em estoque.`);
                              setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x)));
                            }}
                            aria-label="Aumentar"
                          >
                            <Plus />
                          </Button>
                        </div>
                      )}
                      <div className="w-32">
                        <MoneyInput value={l.discount} onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, discount: Math.min(v, x.unitPrice * x.quantity) } : x)))} className="h-8 text-xs" aria-label="Desconto do item" placeholder="desconto" />
                      </div>
                      <div className="w-28 text-right">
                        {l.discount > 0 && <p className="text-xs text-muted-foreground line-through tabular">{formatBRL(l.unitPrice * l.quantity)}</p>}
                        <p className="font-semibold tabular">{formatBRL(l.unitPrice * l.quantity - l.discount)}</p>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remover">
                        <Trash2 />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Repeat className="size-4" /> Aparelho na troca
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => {
                setEditingTrade(null);
                setTradeOpen(true);
              }}
            >
              <Plus /> Receber aparelho na troca
            </Button>
          </CardHeader>
          {tradeIns.length > 0 && (
            <CardContent className="flex flex-col gap-2">
              {tradeIns.map((t) => {
                const m = catalog.find((x) => x.id === t.modelId);
                return (
                  <div key={t.key} className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3">
                    <Repeat className="size-5 text-sky-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {m?.name} {t.capacity} {t.color}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        IMEI {t.imei} · {t.batteryHealth != null ? `bateria ${t.batteryHealth}% · ` : ""}grade {t.grade || "—"}
                      </p>
                    </div>
                    <span className="font-semibold text-sky-700 tabular dark:text-sky-300">− {formatBRL(t.finalValue)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingTrade(t);
                        setTradeOpen(true);
                      }}
                      aria-label="Editar troca"
                    >
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setTradeIns((ts) => ts.filter((x) => x.key !== t.key))} aria-label="Remover troca">
                      <X />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      </div>

      {/* DIREITA: cliente, totais e pagamento */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:h-fit">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <FormField label="Cliente">
              <CustomerPicker value={customer} onChange={setCustomer} />
            </FormField>
            {sellers.length > 0 && (
              <FormField label="Vendedor responsável">
                <NativeSelect value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="h-9">
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Subtotal" value={formatBRL(subtotal)} />
            {itemDiscount > 0 && <Row label="Desconto nos itens" value={`− ${formatBRL(itemDiscount)}`} />}
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Desconto no total</span>
              <div className="w-36">
                <MoneyInput value={discount} onChange={(v) => setDiscount(Math.min(v, subtotal - itemDiscount))} className="h-8" />
              </div>
            </div>
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-medium">Total</span>
              <span className="text-2xl font-semibold tabular">{formatBRL(total)}</span>
            </div>
            {tradeTotal > 0 && <Row label="Aparelho na troca" value={`− ${formatBRL(tradeTotal)}`} className="text-sky-700 dark:text-sky-300" />}
            {paid > 0 && <Row label="Pagamentos" value={`− ${formatBRL(paid)}`} />}
            <div className={cn("flex items-baseline justify-between rounded-xl px-3 py-2", remaining === 0 && lines.length ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted")}>
              <span className="font-medium">{remaining === 0 && lines.length ? "Pago" : "Falta receber"}</span>
              <span className="text-lg font-semibold tabular">{formatBRL(Math.max(remaining, 0))}</span>
            </div>
            {interest > 0 && <p className="text-xs text-muted-foreground">+ juros do parcelamento pagos pelo cliente: {formatBRL(interest)}</p>}
          </CardContent>
        </Card>

        {lines.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentsPanel remaining={remaining} payments={payments} onChange={setPayments} cardRules={cardRules} hasCustomer={!!customer} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <FormField label="Observações da venda">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </CardContent>
        </Card>

        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <Button variant="outline" size="lg" className="h-12 flex-1" onClick={() => submit("ORCAMENTO")} disabled={!!saving || !lines.length}>
            {saving === "ORCAMENTO" ? <Loader2 className="animate-spin" /> : <FileText />} Orçamento
          </Button>
          <Button size="lg" className="h-12 flex-[2] text-base" onClick={() => submit("CONCLUIR")} disabled={!!saving || !lines.length || remaining !== 0}>
            {saving === "CONCLUIR" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Finalizar venda
          </Button>
        </div>
      </div>

      <TradeInDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        catalog={catalog}
        initial={editingTrade}
        onSave={(t) => setTradeIns((ts) => (ts.some((x) => x.key === t.key) ? ts.map((x) => (x.key === t.key ? t : x)) : [...ts, t]))}
      />

      <ApprovalDialog open={approvalOpen} onOpenChange={setApprovalOpen} message={approvalMsg} onConfirm={(cred) => submit("CONCLUIR", cred)} loading={saving === "CONCLUIR"} />
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function SellableSearch({ onPick, customerId, saleId }: { onPick: (s: Sellable) => void; customerId?: string | null; saleId?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Sellable[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run(term: string, autoAddExact: boolean) {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const res = await searchSellables({ q: term, customerId, saleId });
    setLoading(false);
    if (!res.ok) return toast.error(res.error);
    const exact = res.data.filter((r) => r.exact);
    if (autoAddExact && exact.length === 1) {
      onPick(exact[0]);
      setQ("");
      setResults([]);
      return;
    }
    setResults(res.data);
  }

  useEffect(() => {
    const t = setTimeout(() => run(q, false), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // leitor de código de barras envia Enter no final
              if (e.key === "Enter") {
                e.preventDefault();
                run(q, true);
              }
            }}
            placeholder="Escaneie ou digite IMEI, modelo, acessório, código de barras…"
            className="h-12 rounded-2xl pl-11 text-base shadow-soft"
          />
          {loading && <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <BarcodeScannerButton
          size="icon-lg"
          variant="outline"
          label="Escanear"
          onResult={(t) => {
            const v = (t.match(/\d{15}/)?.[0] ?? t).trim();
            setQ(v);
            run(v, true);
          }}
        />
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-[60vh] w-full overflow-y-auto rounded-2xl border bg-popover p-1 shadow-xl">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              onClick={() => {
                onPick(r);
                setQ("");
                setResults([]);
                input.current?.focus();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                {r.type === "DEVICE" ? <Smartphone className="size-4" /> : <Headphones className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                  {r.title}
                  {r.type === "DEVICE" && <StatusBadge value={r.condition} options={DEVICE_CONDITION} className="h-5" />}
                  {r.type === "DEVICE" && r.status === "RESERVADO" && (
                    <StatusBadge tone={r.reservedForOther ? "red" : "amber"} className="h-5">
                      {r.reservedForOther ? "reservado p/ outro" : "reservado p/ este cliente"}
                    </StatusBadge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.subtitle}
                  {r.type === "ACCESSORY" && ` · ${r.stock} em estoque`}
                </p>
              </div>
              <span className="font-semibold tabular">{formatBRL(r.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalDialog({
  open,
  onOpenChange,
  message,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  message: string;
  onConfirm: (c: { email: string; password: string }) => void;
  loading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" /> Aprovação do gerente
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm({ email, password });
          }}
        >
          <FormField label="E-mail do gerente">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoFocus />
          </FormField>
          <FormField label="Senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={loading || !email || !password}>
              {loading && <Loader2 className="animate-spin" />} Aprovar e finalizar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
