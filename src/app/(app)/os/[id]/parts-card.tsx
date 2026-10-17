"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { formatBRL } from "@/domain/money";
import { addPartAction, removePartAction } from "@/features/service-orders/actions";

type Part = { id: string; name: string; sku: string; quantity: number; unitCost: number; unitPrice: number };
type Acc = { id: string; name: string; sku: string; quantity: number; price: number; isPart: boolean };

export function PartsCard({ soId, kind, canEdit, showCost, accessories, parts }: { soId: string; kind: string; canEdit: boolean; showCost: boolean; accessories: Acc[]; parts: Part[] }) {
  const router = useRouter();
  const [accessoryId, setAccessoryId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const acc = accessories.find((a) => a.id === accessoryId);
  const client = kind === "CLIENTE";

  async function add() {
    setBusy(true);
    const res = await addPartAction({ serviceOrderId: soId, accessoryId, quantity, unitPrice: client ? unitPrice : 0 });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Peça adicionada — baixada do estoque");
    setAccessoryId("");
    setQuantity(1);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Peças e materiais</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {parts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma peça usada.</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {parts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">
                    {p.quantity}× {p.name}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">{p.sku}</span>
                </span>
                <span className="flex items-center gap-3 text-right text-xs">
                  {showCost && <span className="text-muted-foreground tabular">custo {formatBRL(p.unitCost * p.quantity)}</span>}
                  {client && p.unitPrice > 0 && <span className="tabular">{formatBRL(p.unitPrice * p.quantity)}</span>}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover peça"
                      onClick={async () => {
                        const res = await removePartAction({ partId: p.id, serviceOrderId: soId });
                        if (!res.ok) return toast.error(res.error);
                        toast.success("Peça devolvida ao estoque");
                        router.refresh();
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_5rem_auto] md:grid-cols-[1fr_5rem_8rem_auto]">
            <FormField label="Peça / acessório do estoque">
              <NativeSelect
                value={accessoryId}
                onChange={(e) => {
                  setAccessoryId(e.target.value);
                  setUnitPrice(accessories.find((a) => a.id === e.target.value)?.price ?? 0);
                }}
                className="h-9"
              >
                <option value="">Selecione…</option>
                <optgroup label="Peças">
                  {accessories.filter((a) => a.isPart).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.quantity} em estoque)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Acessórios">
                  {accessories.filter((a) => !a.isPart).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.quantity} em estoque)
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </FormField>
            <FormField label="Qtd">
              <Input type="number" min={1} max={acc?.quantity} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
            </FormField>
            {client && (
              <FormField label="Preço ao cliente" className="hidden md:flex">
                <MoneyInput value={unitPrice} onChange={setUnitPrice} />
              </FormField>
            )}
            <Button onClick={add} disabled={!accessoryId || busy} className="h-9">
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
