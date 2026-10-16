"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Smartphone, Headphones, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { DEVICE_CONDITION } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import type { CatalogItem } from "@/features/devices/queries";
import { savePurchaseAction } from "@/features/purchases/actions";

export type EditorItem = {
  key: string;
  kind: "DEVICE" | "ACCESSORY";
  modelId: string;
  capacity: string;
  color: string;
  condition: string;
  accessoryId: string;
  quantity: number;
  unitCost: number;
  salePrice: number;
};

let k = 0;
const newItem = (kind: "DEVICE" | "ACCESSORY"): EditorItem => ({
  key: `n${++k}`,
  kind,
  modelId: "",
  capacity: "",
  color: "",
  condition: "SEMINOVO",
  accessoryId: "",
  quantity: 1,
  unitCost: 0,
  salePrice: 0,
});

export function PurchaseEditor({
  id,
  suppliers,
  catalog,
  accessories,
  initial,
}: {
  id?: string;
  suppliers: { id: string; name: string }[];
  catalog: CatalogItem[];
  accessories: { id: string; name: string; sku: string; cost: number; price: number }[];
  initial?: { supplierId: string; expectedAt: string; dueDate: string; notes: string; items: EditorItem[] };
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [expectedAt, setExpectedAt] = useState(initial?.expectedAt ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<EditorItem[]>(initial?.items ?? [newItem("DEVICE")]);
  const [saving, setSaving] = useState(false);
  const total = useMemo(() => items.reduce((a, i) => a + i.quantity * i.unitCost, 0), [items]);

  const update = (key: string, patch: Partial<EditorItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function save() {
    setSaving(true);
    const res = await savePurchaseAction({
      id,
      supplierId,
      expectedAt,
      dueDate,
      notes,
      items: items.map(({ key: _key, ...i }) => ({ ...i, condition: i.kind === "DEVICE" ? (i.condition as "SEMINOVO") : null })),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Pedido salvo");
    router.push(`/compras/${res.data.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        {items.map((it, idx) => {
          const model = catalog.find((m) => m.id === it.modelId);
          return (
            <Card key={it.key}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {it.kind === "DEVICE" ? <Smartphone className="size-4" /> : <Headphones className="size-4" />}
                    Item {idx + 1} — {it.kind === "DEVICE" ? "Aparelho" : "Acessório"}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} aria-label="Remover item" disabled={items.length === 1}>
                    <Trash2 />
                  </Button>
                </div>
                {it.kind === "DEVICE" ? (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <FormField label="Modelo" className="sm:col-span-2">
                      <NativeSelect value={it.modelId} onChange={(e) => update(it.key, { modelId: e.target.value, capacity: "", color: "" })} className="h-9">
                        <option value="">Selecione…</option>
                        {catalog.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <FormField label="Capacidade">
                      <NativeSelect value={it.capacity} onChange={(e) => update(it.key, { capacity: e.target.value })} className="h-9">
                        <option value="">—</option>
                        {model?.capacities.map((c) => <option key={c}>{c}</option>)}
                      </NativeSelect>
                    </FormField>
                    <FormField label="Cor (opcional)">
                      <NativeSelect value={it.color} onChange={(e) => update(it.key, { color: e.target.value })} className="h-9">
                        <option value="">Variadas</option>
                        {model?.colors.map((c) => <option key={c}>{c}</option>)}
                      </NativeSelect>
                    </FormField>
                    <FormField label="Condição">
                      <NativeSelect value={it.condition} onChange={(e) => update(it.key, { condition: e.target.value })} className="h-9">
                        {DEVICE_CONDITION.list.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <FormField label="Quantidade">
                      <Input type="number" min={1} value={it.quantity} onChange={(e) => update(it.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                    </FormField>
                    <FormField label="Custo unitário">
                      <MoneyInput value={it.unitCost} onChange={(v) => update(it.key, { unitCost: v })} />
                    </FormField>
                    <FormField label="Preço de venda">
                      <MoneyInput value={it.salePrice} onChange={(v) => update(it.key, { salePrice: v })} />
                    </FormField>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <FormField label="Acessório" className="sm:col-span-2">
                      <NativeSelect
                        value={it.accessoryId}
                        onChange={(e) => {
                          const a = accessories.find((x) => x.id === e.target.value);
                          update(it.key, { accessoryId: e.target.value, unitCost: a?.cost ?? 0 });
                        }}
                        className="h-9"
                      >
                        <option value="">Selecione…</option>
                        {accessories.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.sku})
                          </option>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <FormField label="Quantidade">
                      <Input type="number" min={1} value={it.quantity} onChange={(e) => update(it.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                    </FormField>
                    <FormField label="Custo unitário">
                      <MoneyInput value={it.unitCost} onChange={(v) => update(it.key, { unitCost: v })} />
                    </FormField>
                  </div>
                )}
                <p className="text-right text-sm text-muted-foreground">
                  Subtotal: <strong className="text-foreground tabular">{formatBRL(it.quantity * it.unitCost)}</strong>
                </p>
              </CardContent>
            </Card>
          );
        })}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setItems((l) => [...l, newItem("DEVICE")])}>
            <Plus /> Aparelho
          </Button>
          <Button variant="outline" onClick={() => setItems((l) => [...l, newItem("ACCESSORY")])}>
            <Plus /> Acessório
          </Button>
        </div>
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Pedido</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Fornecedor" required>
            <NativeSelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-9">
              <option value="">Selecione…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Previsão de chegada">
            <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          </FormField>
          <FormField label="Vencimento do pagamento" hint="Usado na conta a pagar gerada no recebimento.">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField label="Observações">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold tabular">{formatBRL(total)}</span>
          </div>
          <Button size="lg" className="h-11" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar rascunho
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
