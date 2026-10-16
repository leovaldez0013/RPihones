"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { formatDateTime } from "@/lib/format";

type Row = { id: string; createdAt: string; user: string; action: string; entity: string; summary: string; before: string; after: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "createdAt", header: "Quando", cell: ({ row }) => <span className="whitespace-nowrap tabular">{formatDateTime(row.original.createdAt)}</span> },
  { accessorKey: "user", header: "Usuário" },
  { accessorKey: "action", header: "Ação", cell: ({ row }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.action}</code> },
  {
    accessorKey: "summary",
    header: "Descrição",
    cell: ({ row }) => (
      <div className="max-w-md">
        <p>{row.original.summary || row.original.entity}</p>
        {(row.original.before || row.original.after) && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">detalhes</summary>
            {row.original.before && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">antes: {row.original.before}</pre>}
            {row.original.after && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">depois: {row.original.after}</pre>}
          </details>
        )}
      </div>
    ),
  },
];

export function AuditTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Buscar por usuário, ação ou descrição…"
      exportDef={[
        { header: "Data", value: (r) => formatDateTime(r.createdAt) },
        { header: "Usuário", value: (r) => r.user },
        { header: "Ação", value: (r) => r.action },
        { header: "Descrição", value: (r) => r.summary },
      ]}
      exportName="auditoria"
      pageSize={50}
    />
  );
}
