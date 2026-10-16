"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MoneyInput } from "@/components/shared/inputs";
import { TRADE_IN_CHECKLIST } from "@/domain/constants";
import type { TradeInAdjustments } from "@/domain/trade-in";
import { saveTradeInAdjustments, saveTradeInPrices } from "@/features/settings/trade-in-actions";

export function TradeInSettings({
  catalog,
  prices: initialPrices,
  adjustments: initialAdj,
}: {
  catalog: { id: string; name: string; capacities: string[] }[];
  prices: Record<string, number>;
  adjustments: TradeInAdjustments;
}) {
  const [prices, setPrices] = useState(initialPrices);
  const [adj, setAdj] = useState(initialAdj);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  async function savePrices() {
    setSaving(true);
    const list = Object.entries(prices).map(([k, v]) => {
      const [modelId, capacity] = k.split("|");
      return { modelId, capacity, baseValue: v };
    });
    const res = await saveTradeInPrices({ prices: list });
    setSaving(false);
    if (res.ok) toast.success("Tabela salva");
    else toast.error(res.error);
  }

  async function saveAdj() {
    setSaving(true);
    const res = await saveTradeInAdjustments(adj);
    setSaving(false);
    if (res.ok) toast.success("Ajustes salvos");
    else toast.error(res.error);
  }

  const visible = catalog.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Tabs defaultValue="tabela">
      <TabsList className="mb-4">
        <TabsTrigger value="tabela">Valores base</TabsTrigger>
        <TabsTrigger value="ajustes">Ajustes por estado</TabsTrigger>
      </TabsList>
      <TabsContent value="tabela" className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input placeholder="Filtrar modelo…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
          <Button className="ml-auto" onClick={savePrices} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar tabela
          </Button>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          {visible.map((m) => (
            <div key={m.id} className="flex flex-col gap-2 border-b p-3 last:border-0 sm:flex-row sm:items-center">
              <span className="w-44 shrink-0 font-medium">{m.name}</span>
              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                {m.capacities.map((c) => (
                  <label key={c} className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {c}
                    <MoneyInput value={prices[`${m.id}|${c}`] ?? 0} onChange={(v) => setPrices((p) => ({ ...p, [`${m.id}|${c}`]: v }))} className="h-8" />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="ajustes" className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Saúde da bateria</CardTitle>
            <CardDescription>Percentual aplicado sobre o valor base.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {adj.battery.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-28">
                  {b.min}% a {b.max}%
                </span>
                <PctInput value={b.pct} onChange={(v) => setAdj((a) => ({ ...a, battery: a.battery.map((x, j) => (j === i ? { ...x, pct: v } : x)) }))} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Grade estético</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.entries(adj.grade).map(([g, v]) => (
              <div key={g} className="flex items-center gap-2 text-sm">
                <span className="w-28">Grade {g}</span>
                <PctInput value={v} onChange={(nv) => setAdj((a) => ({ ...a, grade: { ...a.grade, [g]: nv } }))} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Itens do checklist com problema</CardTitle>
            <CardDescription>iCloud vinculado e bloqueio sempre recusam a troca.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {TRADE_IN_CHECKLIST.filter((c) => c.key !== "icloud" && c.key !== "semBloqueio").map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{c.label}</span>
                <PctInput value={adj.checklist[c.key] ?? 0} onChange={(v) => setAdj((a) => ({ ...a, checklist: { ...a.checklist, [c.key]: v } }))} />
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex justify-end md:col-span-2">
          <Button onClick={saveAdj} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar ajustes
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative w-28">
      <Input type="number" step="0.5" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="pr-7 text-right" />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  );
}
