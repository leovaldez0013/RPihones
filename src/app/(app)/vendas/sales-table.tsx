"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Receipt } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { NativeSelect } from "@/components/shared/inputs";
import { PAYMENT_METHOD, SALE_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  number: number;
  status: string;
  date: string;
  customer: string;
  seller: string;
  items: number;
  description: string;
  methods: string[];
  total: number;
  margin?: number;
};

export function SalesTable({ rows, showMargin, showSeller }: { rows: Row[]; showMargin: boolean; showSeller: boolean }) {
  const [status, setStatus] = useState("");
  const data = useMemo(() => (status ? rows.filter((r) => r.status === status) : rows), [rows, status]);
  const done = data.filter((r) => r.status === "CONCLUIDA");

  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: "number", header: "Nº", cell: ({ row }) => <span className="font-mono">#{row.original.number}</span> },
    { accessorKey: "date", header: "Data", cell: ({ row }) => <span className="whitespace-nowrap tabular">{formatDateTime(row.original.date)}</span> },
    {
      accessorKey: "customer",
      header: "Cliente / itens",
      cell: ({ row }) => (
        <div className="max-w-72">
          <p className="font-medium">{row.original.customer}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
        </div>
      ),
    },
    ...(showSeller ? ([{ accessorKey: "seller", header: "Vendedor" }] as ColumnDef<Row, unknown>[]) : []),
    {
      id: "methods",
      header: "Pagamento",
      cell: ({ row }) => <span className="text-xs">{row.original.methods.map((m) => PAYMENT_METHOD.label(m)).join(" + ") || "—"}</span>,
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} options={SALE_STATUS} /> },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <span className="font-semibold tabular">{formatBRL(row.original.total)}</span>, meta: { className: "text-right" } },
    ...(showMargin
      ? ([
          {
            accessorKey: "margin",
            header: "Lucro",
            cell: ({ row }) =>
              row.original.status === "CONCLUIDA" ? <span className={cn("tabular", (row.original.margin ?? 0) < 0 && "text-destructive")}>{formatBRL(row.original.margin)}</span> : "—",
            meta: { className: "text-right" },
          },
        ] as ColumnDef<Row, unknown>[])
      : []),
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      rowHref={(r) => `/vendas/${r.id}`}
      searchPlaceholder="Nº, cliente, IMEI, modelo…"
      searchText={(r) => `#${r.number} ${r.customer} ${r.seller} ${r.description}`}
      toolbar={
        <>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto rounded-xl">
            <option value="">Todos os status</option>
            {SALE_STATUS.list.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          <span className="text-sm text-muted-foreground">
            {done.length} concluídas · <strong className="text-foreground tabular">{formatBRL(done.reduce((a, r) => a + r.total, 0))}</strong>
          </span>
        </>
      }
      empty={<EmptyState icon={Receipt} title="Nenhuma venda" description="As vendas feitas no PDV aparecem aqui." />}
      exportName="vendas"
      exportDef={[
        { header: "Número", value: (r) => r.number },
        { header: "Data", value: (r) => formatDateTime(r.date) },
        { header: "Cliente", value: (r) => r.customer },
        { header: "Vendedor", value: (r) => r.seller },
        { header: "Itens", value: (r) => r.description },
        { header: "Pagamento", value: (r) => r.methods.map((m) => PAYMENT_METHOD.label(m)).join(" + ") },
        { header: "Status", value: (r) => SALE_STATUS.label(r.status) },
        { header: "Total (R$)", value: (r) => r.total / 100 },
        ...(showMargin ? [{ header: "Lucro (R$)", value: (r: Row) => (r.margin ?? 0) / 100 }] : []),
      ]}
    />
  );
}
