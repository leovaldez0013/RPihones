"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Controller } from "react-hook-form";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownUp, History, Loader2, MoreHorizontal, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { toastFirstError, useZodForm } from "@/components/shared/use-zod-form";
import { BarcodeScannerButton } from "@/components/shared/barcode-scanner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ACCESSORY_CATEGORY, STOCK_MOVEMENT } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { accessorySchema, movementSchema, type AccessoryInput } from "@/features/accessories/schemas";
import { deleteAccessory, getMovements, moveStock, saveAccessory } from "@/features/accessories/actions";

export type AccessoryRow = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  compatibility: string[];
  quantity: number;
  minStock: number;
  price: number;
  isPart: boolean;
  cost?: number;
};

export function AccessoriesTable({
  rows,
  models,
  showCost,
  canEdit,
  canMove,
  initialSearch,
}: {
  rows: AccessoryRow[];
  models: string[];
  showCost: boolean;
  canEdit: boolean;
  canMove: boolean;
  initialSearch?: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [search, setSearch] = useState(initialSearch ?? "");
  const [searchKey, setSearchKey] = useState(0);
  const [editing, setEditing] = useState<AccessoryRow | "new" | null>(null);
  const [moving, setMoving] = useState<AccessoryRow | null>(null);
  const [history, setHistory] = useState<AccessoryRow | null>(null);

  const isLow = (r: AccessoryRow) => r.minStock > 0 && r.quantity <= r.minStock;
  const lowCount = rows.filter(isLow).length;
  const filtered = useMemo(
    () => rows.filter((r) => (!category || r.category === category) && (!lowOnly || isLow(r))),
    [rows, category, lowOnly],
  );

  const columns: ColumnDef<AccessoryRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Produto",
      cell: ({ row }) => (
        <div className="min-w-48">
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{row.original.sku}</span>
            {row.original.barcode && <> · {row.original.barcode}</>}
            {row.original.compatibility.length > 0 && (
              <> · {row.original.compatibility.length > 2 ? `${row.original.compatibility.slice(0, 2).join(", ")} +${row.original.compatibility.length - 2}` : row.original.compatibility.join(", ")}</>
            )}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Categoria",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          {ACCESSORY_CATEGORY.label(row.original.category)}
          {row.original.isPart && <StatusBadge tone="purple">peça</StatusBadge>}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Estoque",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className={cn("inline-flex items-center gap-1 font-semibold tabular", r.quantity <= 0 ? "text-destructive" : isLow(r) && "text-amber-600")}>
            {isLow(r) && <AlertTriangle className="size-3.5" />}
            {r.quantity}
            <span className="text-xs font-normal text-muted-foreground">/ mín. {r.minStock}</span>
          </span>
        );
      },
    },
    ...(showCost
      ? ([{ accessorKey: "cost", header: "Custo médio", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.cost)}</span>, meta: { className: "text-right" } }] as ColumnDef<AccessoryRow, unknown>[])
      : []),
    { accessorKey: "price", header: "Preço", cell: ({ row }) => <span className="font-semibold tabular">{formatBRL(row.original.price)}</span>, meta: { className: "text-right" } },
    {
      id: "actions",
      header: "",
      meta: { className: "w-10" },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ações">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canMove && (
              <DropdownMenuItem onSelect={() => setMoving(row.original)}>
                <ArrowDownUp /> Movimentar estoque
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setHistory(row.original)}>
              <History /> Histórico
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/estoque/etiquetas?acessorios=${row.original.id}&qtd=1`} target="_blank">
                <Printer /> Etiqueta
              </Link>
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem onSelect={() => setEditing(row.original)}>
                  <Pencil /> Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ConfirmDialog
                  trigger={
                    <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  }
                  title={`Excluir "${row.original.name}"?`}
                  description="O produto sai da lista, mas o histórico de movimentações é mantido."
                  onConfirm={async () => {
                    const res = await deleteAccessory({ id: row.original.id });
                    if (!res.ok) return toast.error(res.error);
                    toast.success("Produto excluído");
                    router.refresh();
                  }}
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {lowCount > 0 && (
        <button
          type="button"
          onClick={() => setLowOnly(true)}
          className="flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="size-5" />
          <span>
            <strong>{lowCount}</strong> {lowCount === 1 ? "produto" : "produtos"} com estoque no mínimo ou abaixo.
          </span>
          <span className="ml-auto font-medium">Ver</span>
        </button>
      )}

      <DataTable
        key={searchKey}
        columns={columns}
        data={filtered}
        initialSearch={search}
        searchPlaceholder="Nome, SKU, código de barras, modelo…"
        searchText={(r) => `${r.name} ${r.sku} ${r.barcode} ${r.brand} ${r.compatibility.join(" ")}`}
        rowClassName={(r) => (isLow(r) ? "bg-amber-50/50 dark:bg-amber-950/10" : undefined)}
        toolbar={
          <>
            <BarcodeScannerButton
              label="Ler código"
              onResult={(t) => {
                setSearch(t.trim());
                setSearchKey((k) => k + 1);
              }}
            />
            <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-auto rounded-xl">
              <option value="">Todas as categorias</option>
              {ACCESSORY_CATEGORY.list.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
            <label className="flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-sm">
              <Checkbox checked={lowOnly} onCheckedChange={(v) => setLowOnly(!!v)} /> Estoque baixo
            </label>
            {canEdit && (
              <Button size="lg" className="ml-auto rounded-xl" onClick={() => setEditing("new")}>
                <Plus /> Novo produto
              </Button>
            )}
          </>
        }
        exportName="acessorios"
        exportDef={[
          { header: "SKU", value: (r) => r.sku },
          { header: "Código de barras", value: (r) => r.barcode },
          { header: "Produto", value: (r) => r.name },
          { header: "Categoria", value: (r) => ACCESSORY_CATEGORY.label(r.category) },
          { header: "Compatibilidade", value: (r) => r.compatibility.join(", ") },
          { header: "Quantidade", value: (r) => r.quantity },
          { header: "Mínimo", value: (r) => r.minStock },
          ...(showCost ? [{ header: "Custo médio (R$)", value: (r: AccessoryRow) => (r.cost ?? 0) / 100 }] : []),
          { header: "Preço (R$)", value: (r) => r.price / 100 },
        ]}
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo produto" : "Editar produto"}</DialogTitle>
          </DialogHeader>
          {editing && <AccessoryForm row={editing === "new" ? null : editing} models={models} showCost={showCost} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Movimentar estoque</DialogTitle>
            <DialogDescription>
              {moving?.name} — atual: <strong>{moving?.quantity}</strong> un.
            </DialogDescription>
          </DialogHeader>
          {moving && <MovementForm row={moving} showCost={showCost} onDone={() => setMoving(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico — {history?.name}</DialogTitle>
          </DialogHeader>
          {history && <MovementHistory accessoryId={history.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccessoryForm({ row, models, showCost, onDone }: { row: AccessoryRow | null; models: string[]; showCost: boolean; onDone: () => void }) {
  const router = useRouter();
  const form = useZodForm(accessorySchema, {
    defaultValues: row
      ? { ...row, category: row.category as AccessoryInput["category"], cost: row.cost ?? 0 }
      : { sku: "", barcode: "", name: "", category: "CAPA", brand: "", compatibility: [], cost: 0, price: 0, minStock: 2, isPart: false, initialQty: 0 },
  });
  const { register, control, handleSubmit, formState, watch, setValue } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const compat = (watch("compatibility") as string[]) ?? [];

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveAccessory({ ...v, id: row?.id });
    if (!res.ok) return toast.error(res.error);
    toast.success(row ? "Produto atualizado" : "Produto cadastrado");
    router.refresh();
    onDone();
  }, toastFirstError);

  return (
    <form onSubmit={onSubmit} className="grid max-h-[70vh] gap-4 overflow-y-auto px-1 sm:grid-cols-2">
      <FormField label="Nome" required error={errors.name?.message} className="sm:col-span-2">
        <Input {...register("name")} autoFocus placeholder="Ex.: Capa silicone MagSafe iPhone 15" />
      </FormField>
      <FormField label="SKU / código interno" required error={errors.sku?.message}>
        <Input className="font-mono uppercase" {...register("sku")} />
      </FormField>
      <FormField label="Código de barras (EAN)">
        <div className="flex gap-2">
          <Input className="font-mono" {...register("barcode")} />
          <BarcodeScannerButton size="icon-lg" onResult={(t) => setValue("barcode", t.trim())} />
        </div>
      </FormField>
      <FormField label="Categoria">
        <NativeSelect {...register("category")} className="h-9">
          {ACCESSORY_CATEGORY.list.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Marca">
        <Input {...register("brand")} />
      </FormField>
      {showCost && (
        <FormField label="Custo unitário">
          <Controller control={control} name="cost" render={({ field }) => <MoneyInput value={Number(field.value)} onChange={field.onChange} />} />
        </FormField>
      )}
      <FormField label="Preço de venda">
        <Controller control={control} name="price" render={({ field }) => <MoneyInput value={Number(field.value)} onChange={field.onChange} />} />
      </FormField>
      <FormField label="Estoque mínimo" hint="Abaixo disso o sistema alerta.">
        <Input type="number" min={0} {...register("minStock")} />
      </FormField>
      {!row && (
        <FormField label="Quantidade inicial">
          <Input type="number" min={0} {...register("initialQty")} />
        </FormField>
      )}
      <FormField label="Compatível com" className="sm:col-span-2" hint="Clique para marcar os modelos.">
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border p-2">
          {models.map((m) => {
            const on = compat.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setValue("compatibility", on ? compat.filter((x) => x !== m) : [...compat, m])}
                className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {m}
              </button>
            );
          })}
        </div>
      </FormField>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Controller control={control} name="isPart" render={({ field }) => <Switch id="isPart" checked={!!field.value} onCheckedChange={field.onChange} />} />
        <label htmlFor="isPart" className="text-sm">
          É peça de reposição (usada em ordens de serviço)
        </label>
      </div>
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

function MovementForm({ row, showCost, onDone }: { row: AccessoryRow; showCost: boolean; onDone: () => void }) {
  const router = useRouter();
  const form = useZodForm(movementSchema, {
    defaultValues: { accessoryId: row.id, type: "ENTRADA", quantity: 1, unitCost: row.cost ?? 0, reason: "" },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const type = watch("type");

  const onSubmit = handleSubmit(async (v) => {
    const res = await moveStock(v);
    if (!res.ok) return toast.error(res.error);
    toast.success("Estoque atualizado");
    router.refresh();
    onDone();
  }, toastFirstError);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
        {STOCK_MOVEMENT.list.map((t) => (
          <label
            key={t.value}
            className={cn(
              "cursor-pointer rounded-lg py-1.5 text-center text-sm transition",
              type === t.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            <input type="radio" value={t.value} {...register("type")} className="sr-only" />
            {t.label}
          </label>
        ))}
      </div>
      <FormField label={type === "AJUSTE" ? "Nova quantidade em estoque (contagem)" : "Quantidade"} error={errors.quantity?.message}>
        <Input type="number" min={0} {...register("quantity")} autoFocus />
      </FormField>
      {type === "ENTRADA" && showCost && (
        <FormField label="Custo unitário desta entrada" hint="Atualiza o custo médio.">
          <Controller control={control} name="unitCost" render={({ field }) => <MoneyInput value={Number(field.value)} onChange={field.onChange} />} />
        </FormField>
      )}
      <FormField label="Motivo" required error={errors.reason?.message}>
        <Input
          {...register("reason")}
          placeholder={type === "PERDA" ? "Ex.: produto com defeito" : type === "AJUSTE" ? "Ex.: inventário mensal" : "Ex.: reposição"}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />} Confirmar
        </Button>
      </DialogFooter>
    </form>
  );
}

function MovementHistory({ accessoryId }: { accessoryId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getMovements>> | null>(null);
  useEffect(() => {
    getMovements({ accessoryId }).then(setRows);
  }, [accessoryId]);
  if (rows === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!rows.ok) return <p className="text-sm text-destructive">{rows.error}</p>;
  if (!rows.data.length) return <p className="py-6 text-center text-sm text-muted-foreground">Sem movimentações.</p>;
  return (
    <div className="max-h-[60vh] divide-y overflow-y-auto">
      {rows.data.map((m) => (
        <div key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
          <StatusBadge value={m.type} options={STOCK_MOVEMENT} />
          <div className="min-w-0 flex-1">
            <p className="truncate">{m.reason ?? m.refType}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(m.createdAt)}
              {m.user ? ` · ${m.user}` : ""}
            </p>
          </div>
          <span className={cn("font-semibold tabular", m.quantity > 0 ? "text-emerald-600" : "text-destructive")}>
            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
          </span>
        </div>
      ))}
    </div>
  );
}
