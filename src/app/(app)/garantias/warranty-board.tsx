"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { SO_STATUS, WARRANTY_CLAIM_STATUS } from "@/domain/constants";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { approveClaimAction, claimWarrantyAction, denyClaimAction } from "@/features/warranty/actions";

export type WarrantyRow = {
  id: string;
  number: number;
  kind: string;
  state: "ATIVA" | "VENCENDO" | "VENCIDA" | "CANCELADA";
  customer: { id: string; name: string; phone: string | null } | null;
  description: string;
  imei: string | null;
  startDate: string;
  endDate: string;
  daysLeft: number;
  origin: { href: string; label: string } | null;
  openClaim: boolean;
};

export type ClaimRow = {
  id: string;
  number: number;
  status: string;
  problem: string;
  decisionNote: string | null;
  createdAt: string;
  warrantyNumber: number;
  description: string;
  customer: string;
  serviceOrder: { id: string; number: number; status: string } | null;
};

const TABS = [
  { key: "ativas", label: "Ativas" },
  { key: "vencendo", label: "Vencendo em 7 dias" },
  { key: "vencidas", label: "Vencidas" },
  { key: "acionamentos", label: "Acionamentos" },
];

export function WarrantyBoard({ tab, rows, claims, canClaim, canDecide }: { tab: string; rows: WarrantyRow[]; claims: ClaimRow[]; canClaim: boolean; canDecide: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [claimFor, setClaimFor] = useState<WarrantyRow | null>(null);
  const [decide, setDecide] = useState<{ claim: ClaimRow; mode: "approve" | "deny" } | null>(null);
  const counts = {
    ativas: rows.filter((r) => r.state === "ATIVA" || r.state === "VENCENDO").length,
    vencendo: rows.filter((r) => r.state === "VENCENDO").length,
    vencidas: rows.filter((r) => r.state === "VENCIDA").length,
    acionamentos: claims.filter((c) => c.status === "EM_ANALISE" || c.status === "APROVADO").length,
  } as Record<string, number>;
  const data = rows.filter((r) => (tab === "vencendo" ? r.state === "VENCENDO" : tab === "vencidas" ? r.state === "VENCIDA" : r.state === "ATIVA" || r.state === "VENCENDO"));

  const columns: ColumnDef<WarrantyRow, unknown>[] = [
    { accessorKey: "number", header: "Nº", cell: ({ row }) => <span className="font-mono">#{row.original.number}</span> },
    {
      accessorKey: "description",
      header: "Item / serviço",
      cell: ({ row: { original: r } }) => (
        <div className="min-w-0">
          <p className="font-medium">{r.description}</p>
          <p className="text-xs text-muted-foreground">
            {r.imei ? `IMEI ${r.imei}` : r.kind === "OS" ? "Serviço" : "Sem IMEI"}
            {r.origin && (
              <>
                {" · "}
                <Link href={r.origin.href} className="underline underline-offset-2">
                  {r.origin.label}
                </Link>
              </>
            )}
          </p>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Cliente",
      cell: ({ row: { original: r } }) =>
        r.customer ? (
          <Link href={`/clientes/${r.customer.id}`} className="hover:underline">
            {r.customer.name}
            <span className="block text-xs text-muted-foreground">{formatPhone(r.customer.phone)}</span>
          </Link>
        ) : (
          <span className="text-muted-foreground">Consumidor</span>
        ),
    },
    { accessorKey: "startDate", header: "Início", cell: ({ row }) => formatDate(row.original.startDate) },
    {
      accessorKey: "endDate",
      header: "Vence em",
      cell: ({ row: { original: r } }) => (
        <span className={cn(r.state === "VENCENDO" && "font-medium text-amber-600 dark:text-amber-400", r.state === "VENCIDA" && "text-muted-foreground")}>
          {formatDate(r.endDate)}
          <span className="block text-xs">{r.state === "VENCIDA" ? `vencida há ${-r.daysLeft} dia(s)` : `${r.daysLeft} dia(s)`}</span>
        </span>
      ),
    },
    {
      id: "acao",
      header: "",
      meta: { className: "text-right" },
      cell: ({ row: { original: r } }) =>
        r.openClaim ? (
          <StatusBadge tone="amber">Acionada</StatusBadge>
        ) : canClaim && r.state !== "VENCIDA" ? (
          <Button size="sm" variant="outline" onClick={() => setClaimFor(r)}>
            <ShieldAlert /> Acionar
          </Button>
        ) : null,
    },
  ];

  const claimColumns: ColumnDef<ClaimRow, unknown>[] = [
    { accessorKey: "number", header: "Nº", cell: ({ row }) => <span className="font-mono">#{row.original.number}</span> },
    {
      accessorKey: "problem",
      header: "Problema",
      cell: ({ row: { original: c } }) => (
        <div>
          <p className="font-medium">{c.problem}</p>
          <p className="text-xs text-muted-foreground">
            Garantia #{c.warrantyNumber} · {c.description} · {c.customer}
          </p>
          {c.decisionNote && <p className={cn("mt-0.5 text-xs", c.status === "NEGADO" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{c.status === "NEGADO" ? `Motivo: ${c.decisionNote}` : c.decisionNote}</p>}
        </div>
      ),
    },
    { accessorKey: "createdAt", header: "Aberto em", cell: ({ row }) => formatDate(row.original.createdAt) },
    { accessorKey: "status", header: "Situação", cell: ({ row }) => <StatusBadge value={row.original.status} options={WARRANTY_CLAIM_STATUS} /> },
    {
      id: "os",
      header: "OS",
      cell: ({ row: { original: c } }) =>
        c.serviceOrder ? (
          <Link href={`/os/${c.serviceOrder.id}`} className="inline-flex items-center gap-1.5 hover:underline">
            #{c.serviceOrder.number} <StatusBadge value={c.serviceOrder.status} options={SO_STATUS} className="h-5 px-2" />
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "acao",
      header: "",
      meta: { className: "text-right" },
      cell: ({ row: { original: c } }) =>
        c.status === "EM_ANALISE" && canDecide ? (
          <span className="flex justify-end gap-1.5">
            <Button size="sm" onClick={() => setDecide({ claim: c, mode: "approve" })}>
              <Check /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecide({ claim: c, mode: "deny" })}>
              <X /> Negar
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => router.push(`${pathname}?aba=${t.key}`)}
            className={cn("rounded-full border px-3 py-1.5 text-sm", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {t.label} <span className="opacity-70">({counts[t.key]})</span>
          </button>
        ))}
      </div>

      {tab === "acionamentos" ? (
        <DataTable
          columns={claimColumns}
          data={claims}
          searchPlaceholder="Problema, cliente, número…"
          searchText={(c) => `#${c.number} ${c.problem} ${c.customer} ${c.description}`}
          empty={<EmptyState icon={ShieldCheck} title="Nenhum acionamento" description="Use “Acionar” em uma garantia ativa quando o cliente voltar com um problema." />}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          searchPlaceholder="Cliente, IMEI, item, número…"
          searchText={(r) => `#${r.number} ${r.description} ${r.imei ?? ""} ${r.customer?.name ?? ""} ${r.customer?.phone ?? ""}`}
          empty={<EmptyState icon={ShieldCheck} title="Nenhuma garantia aqui" description="As garantias aparecem automaticamente após vendas e OS entregues." />}
          exportName={`garantias-${tab}`}
          exportDef={[
            { header: "Nº", value: (r) => r.number },
            { header: "Item", value: (r) => r.description },
            { header: "IMEI", value: (r) => r.imei ?? "" },
            { header: "Cliente", value: (r) => r.customer?.name ?? "Consumidor" },
            { header: "Início", value: (r) => formatDate(r.startDate) },
            { header: "Vence em", value: (r) => formatDate(r.endDate) },
          ]}
        />
      )}

      <ReasonDialog
        open={!!claimFor}
        onOpenChange={(o) => !o && setClaimFor(null)}
        title={`Acionar garantia #${claimFor?.number ?? ""}`}
        description={claimFor ? `${claimFor.description} — vence em ${formatDate(claimFor.endDate)}. Registre o problema relatado pelo cliente.` : ""}
        placeholder="Problema relatado (ex.: tela piscando, não carrega)"
        confirmLabel="Registrar acionamento"
        onConfirm={async (text) => {
          const res = await claimWarrantyAction({ warrantyId: claimFor!.id, problem: text });
          if (!res.ok) return toast.error(res.error), false;
          toast.success(`Acionamento #${res.data.number} registrado — aguardando análise`);
          router.push(`${pathname}?aba=acionamentos`);
          router.refresh();
          return true;
        }}
      />
      <ReasonDialog
        open={!!decide}
        onOpenChange={(o) => !o && setDecide(null)}
        title={decide?.mode === "approve" ? `Aprovar acionamento #${decide.claim.number}` : `Negar acionamento #${decide?.claim.number ?? ""}`}
        description={decide?.mode === "approve" ? "Abre uma OS do tipo Garantia (valor zero) para o reparo, acompanhada no quadro de OS." : "O motivo fica registrado no acionamento (ex.: mau uso, queda, contato com líquido)."}
        placeholder={decide?.mode === "approve" ? "Observação (opcional)" : "Motivo da negativa"}
        optional={decide?.mode === "approve"}
        destructive={decide?.mode === "deny"}
        confirmLabel={decide?.mode === "approve" ? "Aprovar e abrir OS" : "Negar garantia"}
        onConfirm={async (text) => {
          if (!decide) return false;
          if (decide.mode === "approve") {
            const res = await approveClaimAction({ claimId: decide.claim.id, note: text || null });
            if (!res.ok) return toast.error(res.error), false;
            toast.success(`Aprovado — OS de garantia #${res.data.number} aberta`);
          } else {
            const res = await denyClaimAction({ claimId: decide.claim.id, reason: text });
            if (!res.ok) return toast.error(res.error), false;
            toast.success("Garantia negada — motivo registrado");
          }
          router.refresh();
          return true;
        }}
      />
    </div>
  );
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  confirmLabel,
  optional,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  placeholder: string;
  confirmLabel: string;
  optional?: boolean;
  destructive?: boolean;
  onConfirm: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setText("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy || (!optional && text.trim().length < 3)}
            onClick={async () => {
              setBusy(true);
              const ok = await onConfirm(text.trim());
              setBusy(false);
              if (ok) {
                setText("");
                onOpenChange(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
