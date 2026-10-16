"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Truck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PURCHASE_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDate } from "@/lib/format";

type Row = { id: string; number: number; supplier: string; status: string; items: number; received: number; total: number; createdAt: string; expectedAt: string | null };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "number", header: "Nº", cell: ({ row }) => <span className="font-mono">#{row.original.number}</span> },
  { accessorKey: "supplier", header: "Fornecedor", cell: ({ row }) => <span className="font-medium">{row.original.supplier}</span> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} options={PURCHASE_STATUS} /> },
  {
    id: "recebido",
    header: "Recebido",
    cell: ({ row }) => (
      <div className="flex min-w-28 items-center gap-2">
        <Progress value={row.original.items ? (row.original.received / row.original.items) * 100 : 0} className="h-1.5" />
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular">
          {row.original.received}/{row.original.items}
        </span>
      </div>
    ),
  },
  { accessorKey: "total", header: "Total", cell: ({ row }) => <span className="font-medium tabular">{formatBRL(row.original.total)}</span>, meta: { className: "text-right" } },
  { accessorKey: "createdAt", header: "Criado em", cell: ({ row }) => formatDate(row.original.createdAt) },
  { accessorKey: "expectedAt", header: "Previsão", cell: ({ row }) => formatDate(row.original.expectedAt) },
];

export function PurchasesTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      rowHref={(r) => `/compras/${r.id}`}
      searchPlaceholder="Número, fornecedor…"
      searchText={(r) => `#${r.number} ${r.supplier} ${PURCHASE_STATUS.label(r.status)}`}
      empty={<EmptyState icon={Truck} title="Nenhum pedido de compra" description="Crie um pedido para registrar a entrada de mercadoria com conta a pagar." />}
      exportName="compras"
      exportDef={[
        { header: "Número", value: (r) => r.number },
        { header: "Fornecedor", value: (r) => r.supplier },
        { header: "Status", value: (r) => PURCHASE_STATUS.label(r.status) },
        { header: "Itens", value: (r) => r.items },
        { header: "Recebidos", value: (r) => r.received },
        { header: "Total (R$)", value: (r) => r.total / 100 },
        { header: "Criado em", value: (r) => formatDate(r.createdAt) },
      ]}
    />
  );
}
