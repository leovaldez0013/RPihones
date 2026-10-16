"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { CustomerPicker, type PickedCustomer } from "@/components/forms/customer-picker";
import { DEVICE_CONDITION } from "@/domain/constants";
import type { CatalogItem } from "@/features/devices/queries";
import { saveOrderAction } from "@/features/orders/actions";

export type OrderDefaults = {
  id?: string;
  customer: PickedCustomer | null;
  modelId: string;
  capacity: string;
  color: string;
  condition: string;
  minPrice: number;
  maxPrice: number;
  dueDate: string;
  notes: string;
};

export function OrderForm({ catalog, defaults }: { catalog: CatalogItem[]; defaults?: OrderDefaults }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(defaults?.customer ?? null);
  const [modelId, setModelId] = useState(defaults?.modelId ?? "");
  const [capacity, setCapacity] = useState(defaults?.capacity ?? "");
  const [color, setColor] = useState(defaults?.color ?? "");
  const [condition, setCondition] = useState(defaults?.condition ?? "");
  const [minPrice, setMinPrice] = useState(defaults?.minPrice ?? 0);
  const [maxPrice, setMaxPrice] = useState(defaults?.maxPrice ?? 0);
  const [deposit, setDeposit] = useState(0);
  const [depositMethod, setDepositMethod] = useState<"PIX" | "DINHEIRO" | "DEBITO" | "CREDITO">("PIX");
  const [dueDate, setDueDate] = useState(defaults?.dueDate ?? "");
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const model = catalog.find((m) => m.id === modelId);
  const isEdit = !!defaults?.id;

  async function submit() {
    if (!customer) return toast.error("Selecione o cliente.");
    setSaving(true);
    const res = await saveOrderAction({
      id: defaults?.id,
      customerId: customer.id,
      modelId,
      capacity,
      color,
      condition: condition as "SEMINOVO",
      minPrice: minPrice || null,
      maxPrice: maxPrice || null,
      deposit: isEdit ? 0 : deposit,
      depositMethod: !isEdit && deposit ? depositMethod : null,
      dueDate,
      notes,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(isEdit ? "Encomenda atualizada" : `Encomenda #${res.data.number} registrada`);
    router.push(`/encomendas/${res.data.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Aparelho desejado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Modelo" required className="sm:col-span-2">
              <NativeSelect value={modelId} onChange={(e) => { setModelId(e.target.value); setCapacity(""); setColor(""); }} className="h-9">
                <option value="">Selecione…</option>
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Capacidade">
              <NativeSelect value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-9">
                <option value="">Qualquer</option>
                {model?.capacities.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </FormField>
            <FormField label="Cor">
              <NativeSelect value={color} onChange={(e) => setColor(e.target.value)} className="h-9">
                <option value="">Qualquer</option>
                {model?.colors.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </FormField>
            <FormField label="Condição">
              <NativeSelect value={condition} onChange={(e) => setCondition(e.target.value)} className="h-9">
                <option value="">Qualquer</option>
                {DEVICE_CONDITION.list.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Previsão / prazo combinado">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
            <FormField label="Preço mínimo">
              <MoneyInput value={minPrice} onChange={setMinPrice} />
            </FormField>
            <FormField label="Preço máximo" hint="Usado para avisar quando chegar aparelho compatível.">
              <MoneyInput value={maxPrice} onChange={setMaxPrice} />
            </FormField>
            <FormField label="Observações" className="sm:col-span-2">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </CardContent>
        </Card>
      </div>
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Sinal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isEdit ? (
            <p className="text-sm text-muted-foreground">O sinal registrado não é alterado na edição.</p>
          ) : (
            <>
              <FormField label="Valor do sinal (opcional)">
                <MoneyInput value={deposit} onChange={setDeposit} />
              </FormField>
              {deposit > 0 && (
                <FormField label="Forma de pagamento">
                  <NativeSelect value={depositMethod} onChange={(e) => setDepositMethod(e.target.value as "PIX")} className="h-9">
                    <option value="PIX">PIX</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="DEBITO">Débito</option>
                    <option value="CREDITO">Crédito à vista</option>
                  </NativeSelect>
                </FormField>
              )}
              <p className="text-xs text-muted-foreground">O sinal entra no financeiro agora e é abatido na venda de entrega. Um comprovante é gerado para o cliente.</p>
            </>
          )}
          <Button size="lg" className="h-11" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} {isEdit ? "Salvar" : "Registrar encomenda"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
