"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { toastFirstError, useZodForm } from "@/components/shared/use-zod-form";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormField, MaskedInput, NativeSelect } from "@/components/shared/inputs";
import { ROLES } from "@/domain/constants";
import { formatPct } from "@/lib/format";
import { userSchema, type UserInput } from "@/features/settings/schemas";
import { saveUser } from "@/features/settings/actions";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  commissionPct: number;
  discountLimitPct: number;
  active: boolean;
};

const ROLE_HELP: Record<string, string> = {
  ADMIN: "Acesso total, configurações, financeiro e usuários.",
  GERENTE: "Tudo exceto usuários e dados da empresa. Aprova descontos.",
  VENDEDOR: "Vendas, clientes, encomendas, OS e consulta de estoque. Não vê custo nem margem.",
  TECNICO: "Ordens de serviço e consulta de aparelhos.",
};

export function UsersTable({ users }: { users: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    { accessorKey: "role", header: "Perfil", cell: ({ row }) => <StatusBadge value={row.original.role} options={ROLES} /> },
    { accessorKey: "commissionPct", header: "Comissão", cell: ({ row }) => formatPct(row.original.commissionPct) },
    { accessorKey: "discountLimitPct", header: "Desconto máx.", cell: ({ row }) => formatPct(row.original.discountLimitPct) },
    {
      accessorKey: "active",
      header: "Situação",
      cell: ({ row }) => (
        <StatusBadge tone={row.original.active ? "green" : "gray"}>{row.original.active ? "Ativo" : "Inativo"}</StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => setEditing(row.original)} aria-label="Editar">
          <Pencil />
        </Button>
      ),
      meta: { className: "w-10" },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        searchPlaceholder="Buscar usuário…"
        onRowClick={(r) => setEditing(r)}
        toolbar={
          <Button size="lg" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus /> Novo usuário
          </Button>
        }
      />
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo usuário" : "Editar usuário"}</DialogTitle>
          </DialogHeader>
          {editing && <UserForm row={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserForm({ row, onDone }: { row: Row | null; onDone: () => void }) {
  const router = useRouter();
  const form = useZodForm(userSchema, {
    defaultValues: row
      ? { ...row, role: row.role as UserInput["role"], password: "" }
      : { name: "", email: "", role: "VENDEDOR", phone: "", commissionPct: 1, discountLimitPct: 5, password: "", active: true },
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const errors = formState.errors;
  const role = watch("role");

  const onSubmit = handleSubmit(async (values) => {
    const res = await saveUser({ ...values, id: row?.id });
    if (!res.ok) return toast.error(res.error);
    toast.success(row ? "Usuário atualizado" : "Usuário criado");
    router.refresh();
    onDone();
  }, toastFirstError);

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <FormField label="Nome" required error={errors.name?.message} className="sm:col-span-2">
        <Input {...register("name")} autoFocus />
      </FormField>
      <FormField label="E-mail (login)" required error={errors.email?.message}>
        <Input type="email" {...register("email")} />
      </FormField>
      <FormField label="Telefone" error={errors.phone?.message}>
        <Controller control={control} name="phone" render={({ field }) => <MaskedInput mask="phone" {...field} />} />
      </FormField>
      <FormField label="Perfil" hint={ROLE_HELP[String(role)]} className="sm:col-span-2">
        <NativeSelect {...register("role")}>
          {ROLES.list.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Comissão padrão (%)" error={errors.commissionPct?.message}>
        <Input type="number" step="0.1" {...register("commissionPct")} />
      </FormField>
      <FormField label="Desconto máximo sem aprovação (%)" error={errors.discountLimitPct?.message}>
        <Input type="number" step="0.5" {...register("discountLimitPct")} />
      </FormField>
      <FormField
        label={row ? "Nova senha (deixe em branco para manter)" : "Senha inicial"}
        required={!row}
        error={errors.password?.message}
        className="sm:col-span-2"
      >
        <Input type="password" autoComplete="new-password" {...register("password")} />
      </FormField>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Controller
          control={control}
          name="active"
          render={({ field }) => <Switch id="active" checked={!!field.value} onCheckedChange={field.onChange} />}
        />
        <label htmlFor="active" className="text-sm">
          Usuário ativo (pode fazer login)
        </label>
      </div>
      <DialogFooter className="sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}
