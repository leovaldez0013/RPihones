"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Ban, CheckCircle2, Loader2, MoreHorizontal, Paperclip, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { toastFirstError, useZodForm } from "@/components/shared/use-zod-form";
import { ENTRY_STATUS, ORIGIN_TYPE, PAYMENT_METHOD } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { entrySchema } from "@/features/finance/schemas";
import { cancelEntryAction, saveEntryAction, settleEntryAction } from "@/features/finance/actions";

export type EntryRow = {
  id: string;
  type: "RECEBER" | "PAGAR";
  description: string;
  amount: number;
  netAmount: number;
  dueDate: string;
  paidAt: string | null;
  status: string;
  rawStatus: string;
  category: string;
  categoryId: string | null;
  account: string;
  accountId: string | null;
  method: string | null;
  party: string;
  supplierId: string | null;
  originType: string;
  originId: string | null;
  notes: string;
  attachments: string[];
};

type Opt = { id: string; name: string; kind?: string; dreGroup?: string };

const ORIGIN_LINK: Record<string, (id: string) => string | null> = {
  VENDA: (id) => `/vendas/${id}`,
  COMPRA: (id) => `/compras/${id}`,
  OS: (id) => `/os/${id}`,
  ENCOMENDA: (id) => `/encomendas/${id}`,
};

const PERIODS = [
  { value: "mes", label: "Vencimento neste mês" },
  { value: "30", label: "Próximos 30 dias" },
  { value: "vencidas", label: "Vencidas" },
  { value: "todos", label: "Todo o período" },
];

export function EntriesTable({ rows, categories, accounts, suppliers, highlightId }: { rows: EntryRow[]; categories: Opt[]; accounts: Opt[]; suppliers: Opt[]; highlightId?: string }) {
  const [type, setType] = useState<"" | "RECEBER" | "PAGAR">("");
  const [status, setStatus] = useState(highlightId ? "" : "ABERTA_VENCIDA");
  const [period, setPeriod] = useState(highlightId ? "todos" : "30");
  const [editing, setEditing] = useState<EntryRow | "new-PAGAR" | "new-RECEBER" | null>(null);
  const [settling, setSettling] = useState<EntryRow | null>(null);

  const filtered = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const in30 = new Date(now.getTime() + 30 * 86400000);
    return rows.filter((r) => {
      if (highlightId && r.id === highlightId) return true;
      if (type && r.type !== type) return false;
      if (status === "ABERTA_VENCIDA" && !["ABERTA", "VENCIDA"].includes(r.status)) return false;
      if (status && status !== "ABERTA_VENCIDA" && r.status !== status) return false;
      const due = new Date(r.dueDate);
      if (period === "mes" && (due < monthStart || due >= monthEnd)) return false;
      if (period === "30" && due > in30) return false;
      if (period === "vencidas" && r.status !== "VENCIDA") return false;
      return true;
    });
  }, [rows, type, status, period, highlightId]);

  const totals = useMemo(
    () => ({
      in: filtered.filter((r) => r.type === "RECEBER" && r.rawStatus !== "CANCELADA").reduce((a, r) => a + r.netAmount, 0),
      out: filtered.filter((r) => r.type === "PAGAR" && r.rawStatus !== "CANCELADA").reduce((a, r) => a + r.netAmount, 0),
    }),
    [filtered],
  );

  const columns: ColumnDef<EntryRow, unknown>[] = [
    {
      accessorKey: "dueDate",
      header: "Vencimento",
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="tabular">{formatDate(row.original.dueDate)}</p>
          {row.original.paidAt && <p className="text-xs text-muted-foreground">pago {formatDate(row.original.paidAt)}</p>}
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Descrição",
      cell: ({ row }) => {
        const r = row.original;
        const href = r.originId && ORIGIN_LINK[r.originType]?.(r.originId);
        return (
          <div className="min-w-56">
            <p className="font-medium">
              {r.description} {r.attachments.length > 0 && <Paperclip className="inline size-3.5 text-muted-foreground" />}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.category}
              {r.party && ` · ${r.party}`} ·{" "}
              {href ? (
                <Link href={href} className="underline-offset-2 hover:underline">
                  {ORIGIN_TYPE.label(r.originType)}
                </Link>
              ) : (
                ORIGIN_TYPE.label(r.originType)
              )}
            </p>
          </div>
        );
      },
    },
    { accessorKey: "account", header: "Conta", cell: ({ row }) => <span className="text-sm">{row.original.account}{row.original.method && <span className="block text-xs text-muted-foreground">{PAYMENT_METHOD.label(row.original.method)}</span>}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} options={ENTRY_STATUS} /> },
    {
      accessorKey: "netAmount",
      header: "Valor",
      meta: { className: "text-right" },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="text-right">
            <p className={cn("font-semibold tabular", r.type === "RECEBER" ? "text-emerald-600" : "text-foreground", r.rawStatus === "CANCELADA" && "line-through opacity-50")}>
              {r.type === "PAGAR" ? "−" : "+"} {formatBRL(r.netAmount)}
            </p>
            {r.netAmount !== r.amount && <p className="text-xs text-muted-foreground">bruto {formatBRL(r.amount)}</p>}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      meta: { className: "w-24" },
      cell: ({ row }) => {
        const r = row.original;
        if (r.rawStatus !== "ABERTA") return null;
        return (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => setSettling(r)}>
              <CheckCircle2 /> Baixar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(r)}>
                  <Pencil /> Editar
                </DropdownMenuItem>
                {r.originType !== "VENDA" && <CancelItem id={r.id} />}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={filtered}
        pageSize={30}
        searchPlaceholder="Descrição, fornecedor, cliente…"
        searchText={(r) => `${r.description} ${r.party} ${r.category} ${r.account}`}
        rowClassName={(r) => (r.id === highlightId ? "bg-primary/5" : r.status === "VENCIDA" ? "bg-red-50/60 dark:bg-red-950/10" : undefined)}
        toolbar={
          <>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as "")} className="h-9 w-auto rounded-xl">
              <option value="">Pagar e receber</option>
              <option value="RECEBER">A receber</option>
              <option value="PAGAR">A pagar</option>
            </NativeSelect>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto rounded-xl">
              <option value="ABERTA_VENCIDA">Em aberto</option>
              <option value="">Todos os status</option>
              {ENTRY_STATUS.list.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 w-auto rounded-xl">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="lg" className="rounded-xl" onClick={() => setEditing("new-RECEBER")}>
                <Plus /> Receita
              </Button>
              <Button size="lg" className="rounded-xl" onClick={() => setEditing("new-PAGAR")}>
                <Plus /> Despesa
              </Button>
            </div>
          </>
        }
        exportName="financeiro"
        exportDef={[
          { header: "Tipo", value: (r) => (r.type === "RECEBER" ? "Receber" : "Pagar") },
          { header: "Vencimento", value: (r) => formatDate(r.dueDate) },
          { header: "Pagamento", value: (r) => (r.paidAt ? formatDate(r.paidAt) : "") },
          { header: "Descrição", value: (r) => r.description },
          { header: "Categoria", value: (r) => r.category },
          { header: "Conta", value: (r) => r.account },
          { header: "Origem", value: (r) => ORIGIN_TYPE.label(r.originType) },
          { header: "Status", value: (r) => ENTRY_STATUS.label(r.status) },
          { header: "Valor bruto (R$)", value: (r) => r.amount / 100 },
          { header: "Valor líquido (R$)", value: (r) => r.netAmount / 100 },
        ]}
      />
      <div className="flex justify-end gap-6 text-sm">
        <span>
          Entradas no filtro: <strong className="text-emerald-600 tabular">{formatBRL(totals.in)}</strong>
        </span>
        <span>
          Saídas no filtro: <strong className="tabular">{formatBRL(totals.out)}</strong>
        </span>
        <span>
          Saldo: <strong className={cn("tabular", totals.in - totals.out < 0 && "text-destructive")}>{formatBRL(totals.in - totals.out)}</strong>
        </span>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {typeof editing === "string" ? (editing === "new-PAGAR" ? "Nova despesa / conta a pagar" : "Nova receita / conta a receber") : "Editar lançamento"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <EntryForm
              row={typeof editing === "string" ? null : editing}
              type={typeof editing === "string" ? (editing === "new-PAGAR" ? "PAGAR" : "RECEBER") : editing.type}
              categories={categories}
              accounts={accounts}
              suppliers={suppliers}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!settling} onOpenChange={(o) => !o && setSettling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{settling?.type === "RECEBER" ? "Confirmar recebimento" : "Confirmar pagamento"}</DialogTitle>
            <DialogDescription>{settling?.description}</DialogDescription>
          </DialogHeader>
          {settling && <SettleForm row={settling} accounts={accounts} onDone={() => setSettling(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CancelItem({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
          <Ban /> Cancelar
        </DropdownMenuItem>
      }
      title="Cancelar este lançamento?"
      askReason="Motivo"
      onConfirm={async (reason) => {
        const res = await cancelEntryAction({ id, reason });
        if (!res.ok) return toast.error(res.error);
        toast.success("Lançamento cancelado");
        router.refresh();
      }}
    />
  );
}

function SettleForm({ row, accounts, onDone }: { row: EntryRow; accounts: Opt[]; onDone: () => void }) {
  const router = useRouter();
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(row.accountId ?? accounts.find((a) => a.kind === "BANCO")?.id ?? "");
  const [amount, setAmount] = useState(row.netAmount);
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <FormField label="Data">
        <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </FormField>
      <FormField label="Conta">
        <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9">
          <option value="">Selecione…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Valor efetivo" hint={amount !== row.netAmount ? `Previsto: ${formatBRL(row.netAmount)} (diferença de juros/desconto)` : undefined}>
        <MoneyInput value={amount} onChange={setAmount} />
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const res = await settleEntryAction({ id: row.id, paidAt, accountId, netAmount: amount });
            setSaving(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Baixa registrada");
            router.refresh();
            onDone();
          }}
        >
          {saving && <Loader2 className="animate-spin" />} Confirmar
        </Button>
      </DialogFooter>
    </div>
  );
}

function EntryForm({ row, type, categories, accounts, suppliers, onDone }: { row: EntryRow | null; type: "PAGAR" | "RECEBER"; categories: Opt[]; accounts: Opt[]; suppliers: Opt[]; onDone: () => void }) {
  const router = useRouter();
  const form = useZodForm(entrySchema, {
    defaultValues: row
      ? { id: row.id, type: row.type, description: row.description, amount: row.amount, dueDate: row.dueDate.slice(0, 10), categoryId: row.categoryId ?? "", accountId: row.accountId ?? "", supplierId: row.supplierId ?? "", notes: row.notes, attachments: row.attachments, recurrence: "NENHUMA", repeat: 1, paid: false }
      : { type, description: "", amount: 0, dueDate: new Date().toISOString().slice(0, 10), categoryId: "", accountId: "", supplierId: "", notes: "", attachments: [], recurrence: "NENHUMA", repeat: 12, paid: false },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const recurrence = watch("recurrence");
  const paid = watch("paid");
  const kind = type === "PAGAR" ? "DESPESA" : "RECEITA";
  const cats = categories.filter((c) => c.kind === kind && c.dreGroup !== "TRANSFERENCIA");

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveEntryAction(v);
    if (!res.ok) return toast.error(res.error);
    toast.success(row ? "Lançamento atualizado" : "Lançamento criado");
    router.refresh();
    onDone();
  }, toastFirstError);

  return (
    <form onSubmit={onSubmit} className="grid max-h-[75vh] gap-4 overflow-y-auto px-1 sm:grid-cols-2">
      <FormField label="Descrição" required error={errors.description?.message} className="sm:col-span-2">
        <Input {...register("description")} autoFocus placeholder={type === "PAGAR" ? "Ex.: Aluguel da loja" : "Ex.: Venda de acessórios em lote"} />
      </FormField>
      <FormField label="Valor" required error={errors.amount?.message}>
        <Controller control={control} name="amount" render={({ field }) => <MoneyInput value={Number(field.value)} onChange={field.onChange} />} />
      </FormField>
      <FormField label="Vencimento" required error={errors.dueDate?.message}>
        <Input type="date" {...register("dueDate")} />
      </FormField>
      <FormField label="Categoria" required error={errors.categoryId?.message}>
        <NativeSelect {...register("categoryId")} className="h-9">
          <option value="">Selecione…</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Conta">
        <NativeSelect {...register("accountId")} className="h-9">
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {type === "PAGAR" && (
        <FormField label="Fornecedor" className="sm:col-span-2">
          <NativeSelect {...register("supplierId")} className="h-9">
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}
      {!row && (
        <div className="grid gap-3 rounded-xl border p-3 sm:col-span-2 sm:grid-cols-2">
          <FormField label="Recorrência">
            <NativeSelect {...register("recurrence")} className="h-9">
              <option value="NENHUMA">Não repete</option>
              <option value="MENSAL">Mensal</option>
              <option value="SEMANAL">Semanal</option>
            </NativeSelect>
          </FormField>
          {recurrence !== "NENHUMA" && (
            <FormField label="Quantidade de lançamentos">
              <Input type="number" min={2} max={36} {...register("repeat")} />
            </FormField>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Controller control={control} name="paid" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} />} />
            {type === "PAGAR" ? "Já foi pago" : "Já foi recebido"} {recurrence !== "NENHUMA" && "(apenas o primeiro)"}
          </label>
          {paid && (
            <FormField label="Data do pagamento">
              <Input type="date" {...register("paidAt")} />
            </FormField>
          )}
        </div>
      )}
      <FormField label="Observações" className="sm:col-span-2">
        <Textarea rows={2} {...register("notes")} />
      </FormField>
      <FormField label="Anexos (boleto, nota, comprovante)" className="sm:col-span-2">
        <Controller control={control} name="attachments" render={({ field }) => <PhotoUpload value={(field.value as string[]) ?? []} onChange={field.onChange} folder="financeiro" accept="image/*,application/pdf" />} />
      </FormField>
      <DialogFooter className="sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}
