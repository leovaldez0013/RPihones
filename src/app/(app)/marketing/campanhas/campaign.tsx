"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, MessageCircle, ShieldOff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField, NativeSelect } from "@/components/shared/inputs";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatBRL } from "@/domain/money";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logSendAction } from "@/features/marketing/actions";

export type CampaignRow = {
  id: string;
  name: string;
  phone: string | null;
  consent: boolean;
  lastDevice: string | null;
  lastPurchase: string | null;
  totalSpent: number;
  purchases: number;
  birthday: number | null;
  birthDate: string | null;
  warrantyUntil: string | null;
  message: string;
  whatsapp: string | null;
  blockedReason: string | null;
  lastSent: string | null;
};

type Seg = { key: string; label: string; param: { label: string; default: number } | null; template: string };

export function Campaign({
  segments,
  segment,
  param,
  model,
  models,
  templates,
  templateKey,
  rows,
}: {
  segments: Seg[];
  segment: string;
  param: number | null;
  model: string | null;
  models: string[];
  templates: { key: string; name: string; requiresConsent: boolean }[];
  templateKey: string;
  rows: CampaignRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const seg = segments.find((s) => s.key === segment)!;
  const [paramValue, setParamValue] = useState(String(param ?? ""));
  const [onlySendable, setOnlySendable] = useState(true);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => setParamValue(String(param ?? "")), [param]);

  const go = (next: Record<string, string | null | undefined>) => {
    const q = new URLSearchParams();
    const merged = { seg: segment, p: param != null ? String(param) : undefined, modelo: model ?? undefined, tpl: templateKey, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    router.push(`${pathname}?${q.toString()}`);
  };

  const sendable = rows.filter((r) => r.whatsapp);
  const data = useMemo(() => (onlySendable ? rows.filter((r) => r.whatsapp) : rows), [rows, onlySendable]);
  const tpl = templates.find((t) => t.key === templateKey)!;

  const columns: ColumnDef<CampaignRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Cliente",
      cell: ({ row: { original: r } }) => (
        <div>
          <a href={`/clientes/${r.id}`} className="font-medium hover:underline">
            {r.name}
          </a>
          <p className="text-xs text-muted-foreground">{r.phone ? formatPhone(r.phone) : "sem telefone"}</p>
        </div>
      ),
    },
    {
      id: "info",
      header: segment === "ANIVERSARIANTES" ? "Aniversário" : segment === "GARANTIA" ? "Garantia até" : "Último aparelho",
      cell: ({ row: { original: r } }) =>
        segment === "ANIVERSARIANTES" ? (
          <span>{r.birthday === 0 ? "Hoje 🎉" : r.birthday === 1 ? "Amanhã" : `em ${r.birthday} dias`}</span>
        ) : segment === "GARANTIA" ? (
          formatDate(r.warrantyUntil)
        ) : (
          <span className="text-sm">{r.lastDevice ?? "—"}</span>
        ),
    },
    { accessorKey: "totalSpent", header: "Total gasto", cell: ({ row: { original: r } }) => <span className="tabular">{formatBRL(r.totalSpent)}</span>, meta: { className: "text-right" } },
    { accessorKey: "lastPurchase", header: "Última compra", cell: ({ row: { original: r } }) => formatDate(r.lastPurchase) },
    {
      id: "send",
      header: "",
      cell: ({ row: { original: r } }) => {
        const done = sent.has(r.id) || (r.lastSent && Date.now() - new Date(r.lastSent).getTime() < 86400000);
        if (!r.whatsapp)
          return (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldOff className="size-3.5" /> {r.blockedReason}
            </span>
          );
        return (
          <div className="flex items-center justify-end gap-2">
            {r.lastSent && !sent.has(r.id) && <span className="hidden text-xs text-muted-foreground md:inline">enviado {formatDate(r.lastSent)}</span>}
            <Button asChild size="sm" variant={done ? "outline" : "default"} className={cn(!done && "bg-emerald-600 text-white hover:bg-emerald-700")}>
              <a
                href={r.whatsapp}
                target="_blank"
                rel="noreferrer"
                onClick={async (e) => {
                  e.stopPropagation();
                  const res = await logSendAction({ customerId: r.id, templateKey, message: r.message });
                  if (!res.ok) return toast.error(res.error);
                  setSent((s) => new Set(s).add(r.id));
                }}
              >
                {done ? <Check /> : <MessageCircle />} {done ? "Enviado" : "Enviar"}
              </a>
            </Button>
          </div>
        );
      },
      meta: { className: "text-right" },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go({ seg: s.key, p: s.param ? String(s.param.default) : null, tpl: s.template, modelo: null })}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", s.key === segment ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_2fr]">
          {seg.param && (
            <FormField label={seg.param.label}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  go({ p: paramValue });
                }}
                className="flex gap-2"
              >
                <Input type="number" min={0} value={paramValue} onChange={(e) => setParamValue(e.target.value)} onBlur={() => paramValue !== String(param) && go({ p: paramValue })} />
              </form>
            </FormField>
          )}
          {segment === "MODELO" && (
            <FormField label="Modelo comprado">
              <NativeSelect value={model ?? ""} onChange={(e) => go({ modelo: e.target.value })} className="h-9">
                {models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <FormField label="Mensagem" hint={tpl.requiresConsent ? "Marketing: só para quem autorizou (LGPD)." : "Relacionamento: pode ir para todos com telefone."}>
            <NativeSelect value={templateKey} onChange={(e) => go({ tpl: e.target.value })} className="h-9">
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className={cn("rounded-xl bg-emerald-500/10 p-3 text-sm whitespace-pre-wrap", !seg.param && segment !== "MODELO" ? "md:col-span-2" : "", seg.param && segment === "MODELO" && "md:col-span-3")}>
            <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Prévia{rows[0] ? ` para ${rows[0].name.split(" ")[0]}` : ""}</p>
            {rows[0]?.message ?? "Nenhum cliente neste segmento."}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge tone="blue">
            <Users className="size-3" /> {rows.length} no segmento
          </StatusBadge>
          <StatusBadge tone="green">{sendable.length} podem receber</StatusBadge>
          {rows.length - sendable.length > 0 && <StatusBadge tone="gray">{rows.length - sendable.length} sem consentimento ou telefone</StatusBadge>}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlySendable} onCheckedChange={setOnlySendable} /> Só quem pode receber
        </label>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Buscar cliente…"
        searchText={(r) => `${r.name} ${r.phone ?? ""} ${r.lastDevice ?? ""}`}
        empty={<EmptyState icon={Users} title="Ninguém neste segmento" description="Ajuste o filtro ou escolha outro segmento." />}
        exportName={`segmento-${segment.toLowerCase()}`}
        exportDef={[
          { header: "Cliente", value: (r) => r.name },
          { header: "Telefone", value: (r) => (r.phone ? formatPhone(r.phone) : "") },
          { header: "Aceita marketing", value: (r) => (r.consent ? "Sim" : "Não") },
          { header: "Último aparelho", value: (r) => r.lastDevice ?? "" },
          { header: "Compras", value: (r) => r.purchases },
          { header: "Total gasto (R$)", value: (r) => r.totalSpent / 100 },
          { header: "Última compra", value: (r) => formatDate(r.lastPurchase) },
          { header: "Aniversário", value: (r) => (r.birthDate ? formatDate(r.birthDate).slice(0, 5) : "") },
          { header: "Garantia até", value: (r) => formatDate(r.warrantyUntil) },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Cada “Enviar” abre o WhatsApp com a mensagem pronta para aquele cliente (envio individual, sem disparo em massa) e registra o contato no histórico.
      </p>
    </div>
  );
}
