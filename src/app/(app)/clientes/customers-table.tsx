"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CustomerForm } from "@/components/forms/customer-form";
import { formatBRL } from "@/domain/money";
import { formatCPF, formatDate, formatPhone, whatsappLink } from "@/lib/format";

export type CustomerRow = {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  birthDate: string | null;
  marketingConsent: boolean;
  purchases: number;
  totalSpent: number;
  lastPurchase: string | null;
};

export function CustomersTable({ rows, canEdit }: { rows: CustomerRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const columns: ColumnDef<CustomerRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Cliente",
      cell: ({ row }) => (
        <div className="min-w-44">
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{[row.original.cpf && formatCPF(row.original.cpf), row.original.city].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: "Contato",
      cell: ({ row }) =>
        row.original.phone ? (
          <a
            href={whatsappLink(row.original.phone, `Olá, ${row.original.name.split(" ")[0]}!`)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-600 hover:underline"
          >
            <MessageCircle className="size-3.5" /> {formatPhone(row.original.phone)}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { accessorKey: "purchases", header: "Compras", meta: { className: "text-center" } },
    { accessorKey: "totalSpent", header: "Total gasto", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.totalSpent)}</span>, meta: { className: "text-right" } },
    { accessorKey: "lastPurchase", header: "Última compra", cell: ({ row }) => formatDate(row.original.lastPurchase) },
    {
      accessorKey: "marketingConsent",
      header: "Marketing",
      cell: ({ row }) => (row.original.marketingConsent ? <StatusBadge tone="green">aceita</StatusBadge> : <StatusBadge tone="gray">não aceita</StatusBadge>),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Nome, CPF, telefone, e-mail…"
        searchText={(r) => `${r.name} ${r.cpf ?? ""} ${r.phone ?? ""} ${r.email ?? ""} ${r.city ?? ""}`}
        rowHref={(r) => `/clientes/${r.id}`}
        toolbar={
          canEdit && (
            <Button size="lg" className="ml-auto rounded-xl" onClick={() => setCreating(true)}>
              <Plus /> Novo cliente
            </Button>
          )
        }
        exportName="clientes"
        exportDef={[
          { header: "Nome", value: (r) => r.name },
          { header: "CPF", value: (r) => formatCPF(r.cpf) },
          { header: "Telefone", value: (r) => formatPhone(r.phone) },
          { header: "E-mail", value: (r) => r.email ?? "" },
          { header: "Cidade", value: (r) => r.city ?? "" },
          { header: "Nascimento", value: (r) => (r.birthDate ? formatDate(r.birthDate) : "") },
          { header: "Compras", value: (r) => r.purchases },
          { header: "Total gasto (R$)", value: (r) => r.totalSpent / 100 },
          { header: "Última compra", value: (r) => (r.lastPurchase ? formatDate(r.lastPurchase) : "") },
          { header: "Aceita marketing", value: (r) => (r.marketingConsent ? "Sim" : "Não") },
        ]}
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto px-1">
            <CustomerForm
              onCancel={() => setCreating(false)}
              onSaved={(c) => {
                setCreating(false);
                router.push(`/clientes/${c.id}`);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
