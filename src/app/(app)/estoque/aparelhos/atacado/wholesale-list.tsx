"use client";

import { useMemo, useState } from "react";
import { FileDown, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField, NativeSelect } from "@/components/shared/inputs";
import { formatBRL } from "@/domain/money";
import { batteryBand, groupWholesale, type BatteryBand, type WholesaleDevice } from "@/domain/wholesale";
import { downloadWholesalePdf, type WholesaleStore } from "@/features/wholesale/pdf";
import { cn } from "@/lib/utils";

const MIN_BATTERY = [
  { value: "", label: "Todas" },
  { value: "95", label: "95% ou mais" },
  { value: "90", label: "90% ou mais" },
  { value: "85", label: "85% ou mais" },
  { value: "80", label: "80% ou mais" },
  { value: "75", label: "75% ou mais" },
];

const BAND_CLASS: Record<BatteryBand, string> = {
  ALTA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  MEDIA: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  BAIXA: "bg-red-500/15 text-red-700 dark:text-red-400",
  SEM: "bg-muted text-muted-foreground",
};

export function WholesaleList({ items, store }: { items: WholesaleDevice[]; store: WholesaleStore }) {
  const [modelId, setModelId] = useState("");
  const [minBattery, setMinBattery] = useState("");
  const [showPrice, setShowPrice] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [busy, setBusy] = useState(false);

  const models = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) if (!seen.has(i.modelId)) seen.set(i.modelId, i.model);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [items]);

  const visible = useMemo(() => {
    const min = minBattery ? Number(minBattery) : null;
    return items.filter((i) => (!modelId || i.modelId === modelId) && (min == null || (i.battery != null && i.battery >= min)));
  }, [items, modelId, minBattery]);

  const chosen = visible.filter((i) => selected.has(i.id));
  const rows = useMemo(() => groupWholesale(chosen), [chosen]);
  const allVisibleChecked = visible.length > 0 && chosen.length === visible.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleVisible = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of visible) {
        if (on) next.add(i.id);
        else next.delete(i.id);
      }
      return next;
    });

  async function generate() {
    setBusy(true);
    try {
      await downloadWholesalePdf(rows, { store, showPrice });
      toast.success("PDF gerado", { description: `${chosen.length} aparelho(s) em ${rows.length} linha(s).` });
    } catch (e) {
      toast.error("Não foi possível gerar o PDF", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) {
    return <EmptyState icon={PackageOpen} title="Nenhum aparelho disponível" description="A lista de atacado usa só aparelhos com status Disponível (sem vendidos, reservados ou em OS)." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Modelo" htmlFor="ws-model">
              <NativeSelect id="ws-model" value={modelId} onChange={(e) => setModelId(e.target.value)} className="h-9">
                <option value="">Todos os modelos</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Bateria mínima" htmlFor="ws-battery">
              <NativeSelect id="ws-battery" value={minBattery} onChange={(e) => setMinBattery(e.target.value)} className="h-9">
                {MIN_BATTERY.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch id="ws-price" checked={showPrice} onCheckedChange={setShowPrice} />
              <Label htmlFor="ws-price">Mostrar preço no PDF</Label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground tabular">
                {chosen.length} de {visible.length} aparelho(s) · {rows.length} linha(s) no PDF
              </span>
              <Button size="lg" onClick={generate} disabled={busy || !chosen.length}>
                {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Gerar PDF Atacado
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardContent className="px-0">
          <label className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 text-sm font-medium">
            <Checkbox checked={allVisibleChecked} onCheckedChange={(v) => toggleVisible(v === true)} aria-label="Marcar todos" />
            Marcar todos {modelId || minBattery ? "do filtro" : ""}
          </label>
          {visible.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum aparelho com esses filtros.</p>}
          <ul className="divide-y">
            {visible.map((d) => {
              const band = batteryBand(d.battery);
              return (
                <li key={d.id}>
                  <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50", !selected.has(d.id) && "opacity-55")}>
                    <Checkbox checked={selected.has(d.id)} onCheckedChange={(v) => toggle(d.id, v === true)} aria-label={`Incluir ${d.model}`} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{d.model}</span> <span className="text-muted-foreground">· {d.capacity} · {d.color}</span>
                    </span>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold tabular", BAND_CLASS[band])}>{d.battery != null ? `${d.battery}%` : "—"}</span>
                    <span className={cn("w-24 text-right font-semibold tabular", !showPrice && "text-muted-foreground line-through")}>{formatBRL(d.price)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
