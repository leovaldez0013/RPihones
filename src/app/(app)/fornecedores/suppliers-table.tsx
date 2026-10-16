"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField, MaskedInput } from "@/components/shared/inputs";
import { useCep } from "@/components/shared/use-cep";
import { toastFirstError, useZodForm } from "@/components/shared/use-zod-form";
import { formatBRL } from "@/domain/money";
import { formatDate, formatDocument, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supplierSchema, type SupplierInput } from "@/features/customers/schemas";
import { deleteSupplier, saveSupplier } from "@/features/customers/actions";

type Row = SupplierInput & { id: string; purchases: number; total: number; lastPurchase: string | null };

export function SuppliersTable({ rows }: { rows: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: "name",
      header: "Fornecedor",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{formatDocument(row.original.document)}</p>
        </div>
      ),
    },
    { accessorKey: "kind", header: "Tipo", cell: ({ row }) => <StatusBadge tone={row.original.kind === "PJ" ? "blue" : "purple"}>{row.original.kind}</StatusBadge> },
    { id: "contato", header: "Contato", cell: ({ row }) => <span className="text-sm">{[row.original.contact, formatPhone(row.original.phone)].filter(Boolean).join(" · ")}</span> },
    { accessorKey: "purchases", header: "Pedidos", meta: { className: "text-center" } },
    { accessorKey: "total", header: "Total comprado", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.total)}</span>, meta: { className: "text-right" } },
    { accessorKey: "lastPurchase", header: "Último pedido", cell: ({ row }) => formatDate(row.original.lastPurchase) },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(r) => setEditing(r)}
        searchPlaceholder="Nome, CNPJ/CPF, contato…"
        toolbar={
          <Button size="lg" className="ml-auto rounded-xl" onClick={() => setEditing("new")}>
            <Plus /> Novo fornecedor
          </Button>
        }
        exportName="fornecedores"
        exportDef={[
          { header: "Nome", value: (r) => r.name },
          { header: "Tipo", value: (r) => r.kind },
          { header: "Documento", value: (r) => formatDocument(r.document) },
          { header: "Telefone", value: (r) => formatPhone(r.phone) },
          { header: "E-mail", value: (r) => r.email ?? "" },
          { header: "Total comprado (R$)", value: (r) => r.total / 100 },
        ]}
      />
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo fornecedor" : "Editar fornecedor"}</DialogTitle>
          </DialogHeader>
          {editing && <SupplierForm row={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SupplierForm({ row, onDone }: { row: Row | null; onDone: () => void }) {
  const router = useRouter();
  const form = useZodForm(supplierSchema, {
    defaultValues: row ?? { kind: "PJ", name: "", document: "", phone: "", email: "", contact: "", cep: "", street: "", number: "", district: "", city: "", state: "", notes: "" },
  });
  const { register, control, handleSubmit, setValue, watch, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const kind = watch("kind");
  const cep = useCep((a) => {
    setValue("street", a.street);
    setValue("district", a.district);
    setValue("city", a.city);
    setValue("state", a.state);
  });

  const onSubmit = handleSubmit(async (v) => {
    const res = await saveSupplier({ ...v, id: row?.id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Fornecedor salvo");
    router.refresh();
    onDone();
  }, toastFirstError);

  return (
    <form onSubmit={onSubmit} className="grid max-h-[75vh] gap-4 overflow-y-auto px-1 sm:grid-cols-6">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:col-span-6">
        {(["PJ", "PF"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setValue("kind", k)}
            className={cn("rounded-lg py-1.5 text-sm", kind === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          >
            {k === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
          </button>
        ))}
      </div>
      <FormField label={kind === "PJ" ? "Razão social / nome fantasia" : "Nome completo"} required error={errors.name?.message} className="sm:col-span-4">
        <Input {...register("name")} autoFocus />
      </FormField>
      <FormField label={kind === "PJ" ? "CNPJ" : "CPF"} error={errors.document?.message} className="sm:col-span-2">
        <Controller control={control} name="document" render={({ field }) => <MaskedInput mask={kind === "PJ" ? "cpfCnpj" : "cpf"} {...field} value={field.value as string} />} />
      </FormField>
      <FormField label="Contato" className="sm:col-span-2">
        <Input {...register("contact")} />
      </FormField>
      <FormField label="Telefone" error={errors.phone?.message} className="sm:col-span-2">
        <Controller control={control} name="phone" render={({ field }) => <MaskedInput mask="phone" {...field} value={field.value as string} />} />
      </FormField>
      <FormField label="E-mail" error={errors.email?.message} className="sm:col-span-2">
        <Input type="email" {...register("email")} />
      </FormField>
      <FormField label="CEP" className="sm:col-span-2" hint={cep.loading ? "Buscando…" : undefined}>
        <Controller
          control={control}
          name="cep"
          render={({ field }) => (
            <MaskedInput
              mask="cep"
              {...field}
              value={field.value as string}
              onChange={(v) => {
                field.onChange(v);
                if (v.replace(/\D/g, "").length === 8) cep.lookup(v);
              }}
            />
          )}
        />
      </FormField>
      <FormField label="Rua" className="sm:col-span-3">
        <Input {...register("street")} />
      </FormField>
      <FormField label="Nº" className="sm:col-span-1">
        <Input {...register("number")} />
      </FormField>
      <FormField label="Bairro" className="sm:col-span-2">
        <Input {...register("district")} />
      </FormField>
      <FormField label="Cidade" className="sm:col-span-3">
        <Input {...register("city")} />
      </FormField>
      <FormField label="UF" className="sm:col-span-1">
        <Input maxLength={2} {...register("state")} />
      </FormField>
      <FormField label="Observações" className="sm:col-span-6">
        <Textarea rows={2} {...register("notes")} />
      </FormField>
      <DialogFooter className="sm:col-span-6">
        {row && (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="destructive" className="mr-auto">
                <Trash2 /> Excluir
              </Button>
            }
            title={`Excluir ${row.name}?`}
            onConfirm={async () => {
              const res = await deleteSupplier({ id: row.id });
              if (!res.ok) return toast.error(res.error);
              toast.success("Fornecedor excluído");
              router.refresh();
              onDone();
            }}
          />
        )}
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
