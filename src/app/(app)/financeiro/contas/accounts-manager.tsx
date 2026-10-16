"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, CreditCard, Landmark, Loader2, Pencil, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { ACCOUNT_KIND } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { calcCard } from "@/domain/installments";
import { DRE_GROUPS } from "@/features/finance/categories";
import { saveAccountAction, saveCardFeesAction, saveCategoryAction } from "@/features/finance/actions";

type Account = { id: string; name: string; kind: string; active: boolean; initialBalance: number; balance: number; toReceive: number; toPay: number };
type Fee = { accountId: string; method: "DEBITO" | "CREDITO"; installments: number; feePct: number; customerRatePct: number; settlementDays: number };
type Category = { id: string; name: string; kind: "RECEITA" | "DESPESA"; dreGroup: string; system: boolean };

const ICON = { CAIXA: Banknote, BANCO: Landmark, MAQUININHA: CreditCard } as const;

export function AccountsManager({ accounts, fees, categories }: { accounts: Account[]; fees: Fee[]; categories: Category[] }) {
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [editingCat, setEditingCat] = useState<Category | "new" | null>(null);
  const machines = accounts.filter((a) => a.kind === "MAQUININHA");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Contas e carteiras</h2>
          <Button onClick={() => setEditing("new")}>
            <Plus /> Nova conta
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const Icon = ICON[a.kind as keyof typeof ICON] ?? Landmark;
            return (
              <div key={a.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{ACCOUNT_KIND.label(a.kind)}</p>
                  </div>
                  {!a.active && <StatusBadge tone="gray">inativa</StatusBadge>}
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(a)} aria-label="Editar conta">
                    <Pencil />
                  </Button>
                </div>
                <p className="text-2xl font-semibold tabular">{formatBRL(a.balance)}</p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    a receber <strong className="text-emerald-600 tabular">{formatBRL(a.toReceive)}</strong>
                  </span>
                  <span>
                    a pagar <strong className="text-foreground tabular">{formatBRL(a.toPay)}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {machines.map((m) => (
        <FeeTable key={m.id} account={m} fees={fees.filter((f) => f.accountId === m.id)} />
      ))}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Plano de contas</h2>
          <Button variant="outline" onClick={() => setEditingCat("new")}>
            <Plus /> Nova categoria
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(["RECEITA", "DESPESA"] as const).map((kind) => (
            <Card key={kind}>
              <CardHeader>
                <CardTitle>{kind === "RECEITA" ? "Receitas" : "Despesas"}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y text-sm">
                {categories
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <button key={c.id} type="button" onClick={() => setEditingCat(c)} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:text-primary">
                      <span>{c.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {DRE_GROUPS[c.dreGroup] ?? c.dreGroup}
                        {c.system && <StatusBadge tone="gray" className="h-5">sistema</StatusBadge>}
                      </span>
                    </button>
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nova conta" : "Editar conta"}</DialogTitle>
          </DialogHeader>
          {editing && <AccountForm account={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingCat} onOpenChange={(o) => !o && setEditingCat(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat === "new" ? "Nova categoria" : "Editar categoria"}</DialogTitle>
          </DialogHeader>
          {editingCat && <CategoryForm category={editingCat === "new" ? null : editingCat} onDone={() => setEditingCat(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState(account?.kind ?? "BANCO");
  const [initial, setInitial] = useState(account?.initialBalance ?? 0);
  const [active, setActive] = useState(account?.active ?? true);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <FormField label="Nome">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Tipo">
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} className="h-9" disabled={!!account}>
          {ACCOUNT_KIND.list.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Saldo inicial">
        <MoneyInput value={initial} onChange={setInitial} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={active} onCheckedChange={setActive} /> Conta ativa
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await saveAccountAction({ id: account?.id, name, kind: kind as "BANCO", initialBalance: initial, active });
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Conta salva");
            router.refresh();
            onDone();
          }}
        >
          {busy && <Loader2 className="animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<"RECEITA" | "DESPESA">(category?.kind ?? "DESPESA");
  const [group, setGroup] = useState(category?.dreGroup ?? "DESPESA_OPERACIONAL");
  const [busy, setBusy] = useState(false);
  const groups = kind === "RECEITA" ? ["RECEITA_VENDAS", "RECEITA_SERVICOS", "OUTRAS", "TRANSFERENCIA"] : ["DESPESA_OPERACIONAL", "OUTRAS", "ESTOQUE", "TRANSFERENCIA"];
  return (
    <div className="flex flex-col gap-4">
      <FormField label="Nome">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Tipo">
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as "RECEITA")} className="h-9" disabled={!!category}>
          <option value="DESPESA">Despesa</option>
          <option value="RECEITA">Receita</option>
        </NativeSelect>
      </FormField>
      <FormField label="Onde entra na DRE" hint={category?.system ? "Categoria do sistema — grupo fixo." : undefined}>
        <NativeSelect value={group} onChange={(e) => setGroup(e.target.value)} className="h-9" disabled={category?.system}>
          {(category?.system ? [group] : groups).map((g) => (
            <option key={g} value={g}>
              {DRE_GROUPS[g]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await saveCategoryAction({ id: category?.id, name, kind, dreGroup: group as "OUTRAS" });
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Categoria salva");
            router.refresh();
            onDone();
          }}
        >
          {busy && <Loader2 className="animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

function FeeTable({ account, fees: initial }: { account: Account; fees: Fee[] }) {
  const router = useRouter();
  const base: Fee[] = [
    { accountId: account.id, method: "DEBITO", installments: 1, feePct: 0, customerRatePct: 0, settlementDays: 1 },
    ...Array.from({ length: 12 }, (_, i): Fee => ({ accountId: account.id, method: "CREDITO", installments: i + 1, feePct: 0, customerRatePct: 0, settlementDays: 30 })),
  ];
  const [fees, setFees] = useState<Fee[]>(base.map((b) => initial.find((f) => f.method === b.method && f.installments === b.installments) ?? b));
  const [busy, setBusy] = useState(false);
  const update = (i: number, patch: Partial<Fee>) => setFees((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const example = 100000;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" /> Taxas — {account.name}
          </CardTitle>
          <CardDescription>Taxa = cobrada da loja pela maquininha. Juros ao cliente = acréscimo total repassado (0 = sem juros). Exemplo calculado sobre {formatBRL(example)}.</CardDescription>
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await saveCardFeesAction({ accountId: account.id, fees: fees.map(({ accountId: _a, ...f }) => f) });
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Taxas salvas — já valem no PDV");
            router.refresh();
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar taxas
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 text-left font-medium">Modalidade</th>
              <th className="py-2 text-left font-medium">Taxa da loja %</th>
              <th className="py-2 text-left font-medium">Juros ao cliente %</th>
              <th className="py-2 text-left font-medium">Recebe em (dias)</th>
              <th className="py-2 text-right font-medium">Cliente paga / parcela</th>
              <th className="py-2 text-right font-medium">Loja recebe</th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f, i) => {
              const c = calcCard(example, f, f.installments);
              return (
                <tr key={`${f.method}${f.installments}`} className="border-t">
                  <td className="py-1.5 font-medium">{f.method === "DEBITO" ? "Débito" : f.installments === 1 ? "Crédito à vista" : `Crédito ${f.installments}x`}</td>
                  <td className="py-1.5 pr-2">
                    <Input type="number" step="0.01" value={f.feePct} onChange={(e) => update(i, { feePct: Number(e.target.value) || 0 })} className="h-8 w-24" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input type="number" step="0.1" value={f.customerRatePct} onChange={(e) => update(i, { customerRatePct: Number(e.target.value) || 0 })} className="h-8 w-24" disabled={f.method === "DEBITO"} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input type="number" value={f.settlementDays} onChange={(e) => update(i, { settlementDays: Number(e.target.value) || 0 })} className="h-8 w-20" />
                  </td>
                  <td className="py-1.5 text-right tabular">
                    {formatBRL(c.customerTotal)}
                    {f.installments > 1 && <span className="block text-xs text-muted-foreground">{f.installments}x {formatBRL(c.installmentValues.at(-1)!)}</span>}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular">{formatBRL(c.net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
