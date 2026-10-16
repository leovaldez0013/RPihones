"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PackageSearch, Smartphone } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ORDER_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = { id: string; number: number; customer: string; phone: string | null; spec: string; deposit: number; maxPrice: number | null; status: string; hasDevice: boolean; createdAt: string; dueDate: string | null };

const OPEN = ["ABERTA", "EM_BUSCA", "CHEGOU", "CLIENTE_AVISADO"];

export function OrdersTable({ rows }: { rows: Row[] }) {
  const [tab, setTab] = useState("ABERTAS");
  const data = useMemo(() => rows.filter((r) => (tab === "ABERTAS" ? OPEN.includes(r.status) : tab === "TODAS" ? true : r.status === tab)), [rows, tab]);
  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: "number", header: "Nº", cell: ({ row }) => <span className="font-mono">#{row.original.number}</span> },
    {
      accessorKey: "customer",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.customer}</p>
          <p className="text-xs text-muted-foreground">{formatPhone(row.original.phone)}</p>
        </div>
      ),
    },
    {
      accessorKey: "spec",
      header: "Aparelho desejado",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          {row.original.spec}
          {row.original.hasDevice && <Smartphone className="size-3.5 text-emerald-600" aria-label="aparelho reservado" />}
        </span>
      ),
    },
    { accessorKey: "deposit", header: "Sinal", cell: ({ row }) => <span className="tabular">{row.original.deposit ? formatBRL(row.original.deposit) : "—"}</span>, meta: { className: "text-right" } },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} options={ORDER_STATUS} /> },
    { accessorKey: "createdAt", header: "Criada em", cell: ({ row }) => formatDate(row.original.createdAt) },
    { accessorKey: "dueDate", header: "Previsão", cell: ({ row }) => formatDate(row.original.dueDate) },
  ];
  const tabs = [{ value: "ABERTAS", label: "Em andamento" }, ...ORDER_STATUS.list, { value: "TODAS", label: "Todas" }];
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", tab === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={data}
        rowHref={(r) => `/encomendas/${r.id}`}
        searchPlaceholder="Cliente, modelo, número…"
        searchText={(r) => `#${r.number} ${r.customer} ${r.phone ?? ""} ${r.spec}`}
        empty={<EmptyState icon={PackageSearch} title="Nenhuma encomenda" description="Registre quando um cliente pedir um aparelho que você não tem." />}
        exportName="encomendas"
        exportDef={[
          { header: "Número", value: (r) => r.number },
          { header: "Cliente", value: (r) => r.customer },
          { header: "Aparelho", value: (r) => r.spec },
          { header: "Sinal (R$)", value: (r) => r.deposit / 100 },
          { header: "Status", value: (r) => ORDER_STATUS.label(r.status) },
          { header: "Criada em", value: (r) => formatDate(r.createdAt) },
        ]}
      />
    </div>
  );
}
