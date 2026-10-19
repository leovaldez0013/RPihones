"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BatteryMedium, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { NativeSelect } from "@/components/shared/inputs";
import { DEVICE_CONDITION, DEVICE_ORIGIN, DEVICE_STATUS } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { formatDate, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeviceRow } from "@/features/devices/queries";

const STATUS_TABS = [
  { value: "ATIVOS", label: "Em estoque" },
  { value: "DISPONIVEL", label: "Disponíveis" },
  { value: "RESERVADO", label: "Reservados" },
  { value: "EM_MANUTENCAO", label: "Manutenção" },
  { value: "EM_AVALIACAO", label: "Avaliação" },
  { value: "VENDIDO", label: "Vendidos" },
  { value: "TODOS", label: "Todos" },
];

const BATTERY = [
  { value: "", label: "Bateria: todas" },
  { value: "90", label: "≥ 90%" },
  { value: "85", label: "≥ 85%" },
  { value: "80", label: "≥ 80%" },
  { value: "-80", label: "< 80%" },
];

export function DevicesTable({
  rows,
  staleDays,
  showCost,
  initialSearch,
  initialStatus,
  initialStale,
}: {
  rows: DeviceRow[];
  staleDays: number;
  showCost: boolean;
  initialSearch?: string;
  initialStatus?: string;
  initialStale?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus ?? "ATIVOS");
  const [model, setModel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState("");
  const [battery, setBattery] = useState("");
  const [staleOnly, setStaleOnly] = useState(!!initialStale);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const models = useMemo(() => [...new Set(rows.map((r) => r.model))].sort(), [rows]);
  const capacities = useMemo(
    () => [...new Set(rows.filter((r) => !model || r.model === model).map((r) => r.capacity))].sort((a, b) => parseInt(a) * (a.includes("TB") ? 1024 : 1) - parseInt(b) * (b.includes("TB") ? 1024 : 1)),
    [rows, model],
  );
  const colors = useMemo(() => [...new Set(rows.filter((r) => !model || r.model === model).map((r) => r.color))].sort(), [rows, model]);

  const active = (r: DeviceRow) => r.status !== "VENDIDO" && r.status !== "DEVOLVIDO";
  const staleCount = rows.filter((r) => active(r) && r.daysInStock > staleDays).length;

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status === "ATIVOS" && !active(r)) return false;
        if (status !== "ATIVOS" && status !== "TODOS" && r.status !== status) return false;
        if (model && r.model !== model) return false;
        if (capacity && r.capacity !== capacity) return false;
        if (color && r.color !== color) return false;
        if (condition && r.condition !== condition) return false;
        if (battery) {
          const b = Number(battery);
          if (r.batteryHealth == null) return false;
          if (b > 0 && r.batteryHealth < b) return false;
          if (b < 0 && r.batteryHealth >= -b) return false;
        }
        if (staleOnly && !(active(r) && r.daysInStock > staleDays)) return false;
        return true;
      }),
    [rows, status, model, capacity, color, condition, battery, staleOnly, staleDays],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { ATIVOS: 0, TODOS: rows.length };
    for (const r of rows) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (active(r)) c.ATIVOS++;
    }
    return c;
  }, [rows]);

  const totals = useMemo(() => {
    const act = filtered.filter(active);
    return {
      qty: act.length,
      sale: act.reduce((a, r) => a + r.salePrice, 0),
      cost: act.reduce((a, r) => a + (r.cost ?? 0), 0),
    };
  }, [filtered]);

  const hasFilters = model || capacity || color || condition || battery || staleOnly;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const columns: ColumnDef<DeviceRow, unknown>[] = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
          onCheckedChange={(v) => setSelected(v ? new Set(filtered.map((r) => r.id)) : new Set())}
          aria-label="Selecionar todos"
        />
      ),
      cell: ({ row }) => (
        <Checkbox checked={selected.has(row.original.id)} onCheckedChange={() => toggle(row.original.id)} aria-label="Selecionar" />
      ),
      meta: { className: "w-8" },
    },
    {
      accessorKey: "model",
      header: "Aparelho",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Link href={`/estoque/aparelhos/${r.id}`} className="block min-w-48">
            <p className="font-medium">
              {r.model} <span className="text-muted-foreground">{r.capacity}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {r.color} · {r.imei ? <span className="font-mono">{r.imei}</span> : <span className="font-medium text-amber-600 dark:text-amber-400">Sem IMEI</span>}
            </p>
          </Link>
        );
      },
    },
    {
      accessorKey: "condition",
      header: "Condição",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge value={row.original.condition} options={DEVICE_CONDITION} />
          {row.original.grade && <span className="text-xs text-muted-foreground">Grade {row.original.grade}</span>}
        </div>
      ),
    },
    {
      accessorKey: "batteryHealth",
      header: "Bateria",
      cell: ({ row }) => {
        const b = row.original.batteryHealth;
        if (b == null) return <span className="text-muted-foreground">—</span>;
        return (
          <span className={cn("inline-flex items-center gap-1 tabular", b < 80 ? "text-red-600" : b < 85 ? "text-amber-600" : "text-emerald-600")}>
            <BatteryMedium className="size-4" />
            {b}%
          </span>
        );
      },
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} options={DEVICE_STATUS} /> },
    {
      accessorKey: "daysInStock",
      header: "Em estoque",
      cell: ({ row }) => {
        const r = row.original;
        if (!active(r)) return <span className="text-muted-foreground">—</span>;
        const stale = r.daysInStock > staleDays;
        return (
          <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular", stale && "font-medium text-amber-600")}>
            {stale && <AlertTriangle className="size-3.5" />}
            {r.daysInStock} {r.daysInStock === 1 ? "dia" : "dias"}
          </span>
        );
      },
    },
    ...(showCost
      ? ([
          { accessorKey: "cost", header: "Custo real", cell: ({ row }) => <span className="tabular">{formatBRL(row.original.cost)}</span>, meta: { className: "text-right" } },
          {
            accessorKey: "margin",
            header: "Margem",
            cell: ({ row }) => {
              const m = row.original.margin ?? 0;
              const pct = row.original.salePrice ? (m / row.original.salePrice) * 100 : 0;
              return (
                <span className={cn("tabular", m < 0 && "text-red-600")}>
                  {formatBRL(m)} <span className="text-xs text-muted-foreground">({formatPct(pct, 0)})</span>
                </span>
              );
            },
            meta: { className: "text-right" },
          },
        ] as ColumnDef<DeviceRow, unknown>[])
      : []),
    {
      accessorKey: "salePrice",
      header: "Preço",
      cell: ({ row }) => <span className="font-semibold tabular">{formatBRL(row.original.salePrice)}</span>,
      meta: { className: "text-right" },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {staleCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setStaleOnly(true);
            setStatus("ATIVOS");
          }}
          className="flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="size-5 shrink-0" />
          <span>
            <strong>{staleCount}</strong> {staleCount === 1 ? "aparelho parado" : "aparelhos parados"} há mais de {staleDays} dias.
            Considere revisar o preço ou fazer uma oferta.
          </span>
          <span className="ml-auto font-medium underline-offset-4 hover:underline">Ver</span>
        </button>
      )}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setStatus(t.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
              status === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 text-xs tabular", status === t.value ? "bg-white/20" : "bg-muted")}>
              {counts[t.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <NativeSelect value={model} onChange={(e) => { setModel(e.target.value); setCapacity(""); setColor(""); }} className="h-9 rounded-xl">
          <option value="">Modelo: todos</option>
          {models.map((m) => <option key={m}>{m}</option>)}
        </NativeSelect>
        <NativeSelect value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-9 rounded-xl">
          <option value="">Capacidade: todas</option>
          {capacities.map((m) => <option key={m}>{m}</option>)}
        </NativeSelect>
        <NativeSelect value={color} onChange={(e) => setColor(e.target.value)} className="h-9 rounded-xl">
          <option value="">Cor: todas</option>
          {colors.map((m) => <option key={m}>{m}</option>)}
        </NativeSelect>
        <NativeSelect value={condition} onChange={(e) => setCondition(e.target.value)} className="h-9 rounded-xl">
          <option value="">Condição: todas</option>
          {DEVICE_CONDITION.list.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </NativeSelect>
        <NativeSelect value={battery} onChange={(e) => setBattery(e.target.value)} className="h-9 rounded-xl">
          {BATTERY.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </NativeSelect>
        <label className="flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-sm">
          <Checkbox checked={staleOnly} onCheckedChange={(v) => setStaleOnly(!!v)} />
          Parados &gt; {staleDays}d
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground tabular">{totals.qty}</strong> em estoque no filtro
        </span>
        <span>
          Valor de venda: <strong className="text-foreground tabular">{formatBRL(totals.sale)}</strong>
        </span>
        {showCost && (
          <span>
            Valor de custo: <strong className="text-foreground tabular">{formatBRL(totals.cost)}</strong>
          </span>
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setModel(""); setCapacity(""); setColor(""); setCondition(""); setBattery(""); setStaleOnly(false);
            }}
          >
            <X /> Limpar filtros
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        initialSearch={initialSearch}
        searchPlaceholder="IMEI, modelo, cor, série…"
        searchText={(r) => `${r.imei ?? "sem imei"} ${r.imei2 ?? ""} ${r.serial ?? ""} ${r.model} ${r.capacity} ${r.color} ${r.supplier ?? ""}`}
        rowHref={(r) => `/estoque/aparelhos/${r.id}`}
        rowClassName={(r) => (active(r) && r.daysInStock > staleDays ? "bg-amber-50/50 dark:bg-amber-950/10" : undefined)}
        toolbar={
          selected.size > 0 && (
            <Button asChild variant="outline" size="lg" className="rounded-xl">
              <Link href={`/estoque/etiquetas?aparelhos=${[...selected].join(",")}`} target="_blank">
                <Printer /> Etiquetas ({selected.size})
              </Link>
            </Button>
          )
        }
        exportName="estoque-aparelhos"
        exportDef={[
          { header: "Modelo", value: (r) => r.model },
          { header: "Capacidade", value: (r) => r.capacity },
          { header: "Cor", value: (r) => r.color },
          { header: "IMEI", value: (r) => r.imei ?? "Sem IMEI" },
          { header: "IMEI 2", value: (r) => r.imei2 ?? "" },
          { header: "Série", value: (r) => r.serial ?? "" },
          { header: "Condição", value: (r) => DEVICE_CONDITION.label(r.condition) },
          { header: "Grade", value: (r) => r.grade ?? "" },
          { header: "Bateria %", value: (r) => r.batteryHealth ?? "" },
          { header: "Status", value: (r) => DEVICE_STATUS.label(r.status) },
          { header: "Origem", value: (r) => DEVICE_ORIGIN.label(r.origin) },
          { header: "Entrada", value: (r) => formatDate(r.entryDate) },
          { header: "Dias em estoque", value: (r) => r.daysInStock },
          ...(showCost ? [{ header: "Custo real (R$)", value: (r: DeviceRow) => (r.cost ?? 0) / 100 }] : []),
          { header: "Preço (R$)", value: (r) => r.salePrice / 100 },
        ]}
      />
    </div>
  );
}
