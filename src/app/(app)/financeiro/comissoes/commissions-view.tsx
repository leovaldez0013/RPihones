"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { NativeSelect } from "@/components/shared/inputs";
import { formatBRL } from "@/domain/money";
import { payCommissionAction } from "@/features/finance/actions";

type Row = { sellerId: string; seller: string; sales: number; total: number; commission: number; paid: number; pending: number };
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const shift = (m: string, d: number) => {
  const [y, mm] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mm - 1 + d, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function CommissionsView({ month, rows, accounts }: { month: string; rows: Row[]; accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [paying, setPaying] = useState<string | null>(null);
  const [y, m] = month.split("-");

  return (
    <DataTable
      columns={[
        { accessorKey: "seller", header: "Vendedor", cell: ({ row }) => <span className="font-medium">{row.original.seller}</span> },
        { accessorKey: "sales", header: "Vendas", meta: { className: "text-center" } },
        { accessorKey: "total", header: "Total vendido", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.total)}</span>, meta: { className: "text-right" } },
        { accessorKey: "commission", header: "Comissão", cell: ({ row }) => <span className="font-semibold tabular">{formatBRL(row.original.commission)}</span>, meta: { className: "text-right" } },
        { accessorKey: "paid", header: "Pago", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.paid)}</span>, meta: { className: "text-right" } },
        {
          id: "status",
          header: "",
          meta: { className: "text-right" },
          cell: ({ row }) =>
            row.original.pending <= 0 ? (
              <StatusBadge tone="green">quitada</StatusBadge>
            ) : (
              <Button
                size="sm"
                disabled={paying === row.original.sellerId || !accountId}
                onClick={async () => {
                  setPaying(row.original.sellerId);
                  const res = await payCommissionAction({ sellerId: row.original.sellerId, month, accountId });
                  setPaying(null);
                  if (!res.ok) return toast.error(res.error);
                  toast.success(`Pagamento de ${formatBRL(row.original.pending)} lançado`);
                  router.refresh();
                }}
              >
                {paying === row.original.sellerId ? <Loader2 className="animate-spin" /> : <Wallet />} Pagar {formatBRL(row.original.pending)}
              </Button>
            ),
        },
      ]}
      data={rows}
      searchPlaceholder="Vendedor…"
      toolbar={
        <>
          <Button variant="outline" size="icon-lg" onClick={() => router.push(`/financeiro/comissoes?mes=${shift(month, -1)}`)} aria-label="Mês anterior">
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center font-medium">
            {MONTHS[Number(m) - 1]} de {y}
          </span>
          <Button variant="outline" size="icon-lg" onClick={() => router.push(`/financeiro/comissoes?mes=${shift(month, 1)}`)} aria-label="Próximo mês">
            <ChevronRight />
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">Pagar pela conta</span>
          <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 w-auto rounded-xl">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </>
      }
      exportName={`comissoes-${month}`}
      exportDef={[
        { header: "Vendedor", value: (r) => r.seller },
        { header: "Vendas", value: (r) => r.sales },
        { header: "Total vendido (R$)", value: (r) => r.total / 100 },
        { header: "Comissão (R$)", value: (r) => r.commission / 100 },
        { header: "Pago (R$)", value: (r) => r.paid / 100 },
        { header: "Pendente (R$)", value: (r) => r.pending / 100 },
      ]}
    />
  );
}
