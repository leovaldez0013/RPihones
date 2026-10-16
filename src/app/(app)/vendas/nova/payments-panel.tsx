"use client";

import { useMemo, useState } from "react";
import { Banknote, CreditCard, FileText, HandCoins, QrCode, Trash2, Wallet, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { PAYMENT_METHOD } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { calcCard, findFee, simulateInstallments, type CardFeeRule } from "@/domain/installments";
import { cn } from "@/lib/utils";

export type PaymentDraft = { key: string; method: string; amount: number; installments: number; accountId?: string | null };

const METHODS = [
  { value: "PIX", icon: QrCode },
  { value: "DINHEIRO", icon: Banknote },
  { value: "DEBITO", icon: CreditCard },
  { value: "CREDITO", icon: CreditCard },
  { value: "CREDITO_PARCELADO", icon: CalendarClock },
  { value: "BOLETO", icon: FileText },
  { value: "CREDIARIO", icon: HandCoins },
] as const;

export function paymentInterest(p: PaymentDraft, rules: CardFeeRule[]) {
  if (p.method !== "CREDITO_PARCELADO" && p.method !== "CREDITO" && p.method !== "DEBITO") return 0;
  const n = p.method === "CREDITO_PARCELADO" ? p.installments : 1;
  const rule = findFee(rules, p.method === "DEBITO" ? "DEBITO" : "CREDITO", n);
  return rule ? calcCard(p.amount, rule, n).interest : 0;
}

export function PaymentsPanel({
  remaining,
  payments,
  onChange,
  cardRules,
  hasCustomer,
}: {
  remaining: number;
  payments: PaymentDraft[];
  onChange: (p: PaymentDraft[]) => void;
  cardRules: CardFeeRule[];
  hasCustomer: boolean;
}) {
  const [method, setMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [installments, setInstallments] = useState(2);
  const [cashGiven, setCashGiven] = useState(0);

  const simulation = useMemo(() => simulateInstallments(amount, cardRules).filter((s) => s.installments >= 2), [amount, cardRules]);
  const maxCrediario = 12;

  function choose(m: string) {
    setMethod(m);
    setAmount(remaining > 0 ? remaining : 0);
    setInstallments(m === "CREDIARIO" ? 3 : 2);
    setCashGiven(0);
  }

  function add() {
    if (!method || amount <= 0) return;
    const value = Math.min(amount, remaining);
    onChange([...payments, { key: `p${Date.now()}`, method, amount: value, installments: method === "CREDITO_PARCELADO" || method === "CREDIARIO" ? installments : 1 }]);
    setMethod(null);
  }

  const selectedSim = simulation.find((s) => s.installments === installments);

  return (
    <div className="flex flex-col gap-3">
      {payments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {payments.map((p) => {
            const interest = paymentInterest(p, cardRules);
            return (
              <div key={p.key} className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
                <Wallet className="size-4 text-muted-foreground" />
                <span className="flex-1">
                  {PAYMENT_METHOD.label(p.method)}
                  {p.installments > 1 && ` em ${p.installments}x`}
                  {interest > 0 && <span className="block text-xs text-muted-foreground">cliente paga {formatBRL(p.amount + interest)} (juros {formatBRL(interest)})</span>}
                </span>
                <span className="font-medium tabular">{formatBRL(p.amount)}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => onChange(payments.filter((x) => x.key !== p.key))} aria-label="Remover pagamento">
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {remaining > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {METHODS.filter((m) => m.value !== "CREDIARIO" || hasCustomer).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => choose(m.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] leading-tight font-medium transition",
                method === m.value ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted",
              )}
            >
              <m.icon className="size-4" />
              {m.value === "CREDITO_PARCELADO" ? "Parcelado" : m.value === "CREDITO" ? "Crédito" : PAYMENT_METHOD.label(m.value)}
            </button>
          ))}
        </div>
      )}

      {method && remaining > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-3">
          <FormField label={`Valor em ${PAYMENT_METHOD.label(method)}`}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus className="h-10 text-base" />
          </FormField>

          {method === "DINHEIRO" && (
            <FormField label="Valor entregue pelo cliente (para troco)">
              <MoneyInput value={cashGiven} onChange={setCashGiven} />
              {cashGiven > amount && (
                <p className="text-sm font-medium text-emerald-600">
                  Troco: <span className="tabular">{formatBRL(cashGiven - amount)}</span>
                </p>
              )}
            </FormField>
          )}

          {method === "CREDITO_PARCELADO" && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Escolha as parcelas — valores já com juros para informar ao cliente:</p>
              <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
                {simulation.map((s) => (
                  <button
                    key={s.installments}
                    type="button"
                    onClick={() => setInstallments(s.installments)}
                    className={cn(
                      "rounded-xl border px-2 py-1.5 text-left text-sm transition",
                      installments === s.installments ? "border-primary bg-primary/10" : "bg-background hover:bg-muted",
                    )}
                  >
                    <span className="font-semibold">{s.installments}x</span> de <span className="tabular">{formatBRL(s.installmentValues[s.installmentValues.length - 1])}</span>
                    <span className={cn("block text-[11px]", s.withInterest ? "text-amber-600" : "text-emerald-600")}>
                      {s.withInterest ? `total ${formatBRL(s.customerTotal)}` : "sem juros"}
                    </span>
                  </button>
                ))}
              </div>
              {selectedSim && (
                <p className="text-xs text-muted-foreground">
                  Loja recebe líquido {formatBRL(selectedSim.net)} (taxa {selectedSim.feePct.toString().replace(".", ",")}%)
                </p>
              )}
            </div>
          )}

          {method === "CREDIARIO" && (
            <FormField label="Número de parcelas (mensais)">
              <NativeSelect value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="h-9">
                {Array.from({ length: maxCrediario - 1 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}x de {formatBRL(Math.ceil(amount / n))}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setMethod(null)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={add} disabled={amount <= 0}>
              Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
