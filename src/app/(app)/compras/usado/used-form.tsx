"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { ImeiField } from "@/components/shared/imei-field";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { CustomerPicker, type PickedCustomer } from "@/components/forms/customer-picker";
import { DeviceChecklist, emptyChecklist } from "@/components/forms/device-checklist";
import { GRADES } from "@/domain/constants";
import type { CatalogItem } from "@/features/devices/queries";
import { buyUsedDeviceAction } from "@/features/purchases/actions";

export function UsedPurchaseForm({ catalog, accounts }: { catalog: CatalogItem[]; accounts: { id: string; name: string; kind: string }[] }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [imei, setImei] = useState("");
  const [modelId, setModelId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [color, setColor] = useState("");
  const [battery, setBattery] = useState("");
  const [grade, setGrade] = useState("A");
  const [checklist, setChecklist] = useState(emptyChecklist());
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [value, setValue] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [method, setMethod] = useState<"PIX" | "DINHEIRO" | "TRANSFERENCIA">("PIX");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const model = catalog.find((m) => m.id === modelId);
  const blocked = checklist.icloud === false || checklist.semBloqueio === false;

  async function submit() {
    if (!customer) return toast.error("Selecione ou cadastre o vendedor (pessoa física).");
    setSaving(true);
    const res = await buyUsedDeviceAction({
      customerId: customer.id,
      imei,
      modelId,
      capacity,
      color,
      batteryHealth: battery,
      grade: grade as "A",
      checklist,
      photos,
      notes,
      value,
      salePrice,
      paymentMethod: method,
      accountId: accountId || null,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Compra nº ${res.data.number} registrada — aparelho no estoque`);
    router.push(`/estoque/aparelhos/${res.data.deviceId}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Vendedor (pessoa física)</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerPicker value={customer} onChange={setCustomer} />
            <p className="mt-2 text-xs text-muted-foreground">É obrigatório ter nome e CPF no termo de compra e declaração de procedência.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Aparelho</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="IMEI" required className="sm:col-span-2">
              <ImeiField value={imei} onChange={setImei} onLookup={(r) => r.tacModel && !modelId && setModelId(r.tacModel.id)} />
            </FormField>
            <FormField label="Modelo" required>
              <NativeSelect value={modelId} onChange={(e) => { setModelId(e.target.value); setCapacity(""); setColor(""); }} className="h-9">
                <option value="">Selecione…</option>
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Capacidade" required>
                <NativeSelect value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-9">
                  <option value="">—</option>
                  {model?.capacities.map((c) => <option key={c}>{c}</option>)}
                </NativeSelect>
              </FormField>
              <FormField label="Cor" required>
                <NativeSelect value={color} onChange={(e) => setColor(e.target.value)} className="h-9">
                  <option value="">—</option>
                  {model?.colors.map((c) => <option key={c}>{c}</option>)}
                </NativeSelect>
              </FormField>
            </div>
            <FormField label="Saúde da bateria (%)">
              <Input type="number" min={0} max={100} value={battery} onChange={(e) => setBattery(e.target.value)} />
            </FormField>
            <FormField label="Grade estético">
              <NativeSelect value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9">
                {GRADES.list.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Checklist de funcionamento" className="sm:col-span-2">
              <DeviceChecklist value={checklist} onChange={setChecklist} />
            </FormField>
            {blocked && (
              <p className="flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-sm font-medium text-red-600 sm:col-span-2">
                <AlertTriangle className="size-4" /> Aparelho com iCloud vinculado ou bloqueio não pode ser comprado.
              </p>
            )}
            <FormField label="Fotos" className="sm:col-span-2">
              <PhotoUpload value={photos} onChange={setPhotos} folder="compras-usados" />
            </FormField>
            <FormField label="Observações" className="sm:col-span-2">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </CardContent>
        </Card>
      </div>
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Pagamento</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Valor pago ao cliente" required>
            <MoneyInput value={value} onChange={setValue} />
          </FormField>
          <FormField label="Preço de venda sugerido">
            <MoneyInput value={salePrice} onChange={setSalePrice} />
          </FormField>
          <FormField label="Forma de pagamento">
            <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="h-9">
              <option value="PIX">PIX</option>
              <option value="TRANSFERENCIA">Transferência</option>
              <option value="DINHEIRO">Dinheiro (sai do caixa)</option>
            </NativeSelect>
          </FormField>
          <FormField label="Conta de saída">
            <NativeSelect value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9">
              <option value="">Padrão ({method === "DINHEIRO" ? "caixa" : "banco"})</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <p className="flex gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" /> Recomendado: faça o teste de IMEI (bloqueio/blacklist) antes de pagar.
          </p>
          <Button size="lg" className="h-11" onClick={submit} disabled={saving || blocked}>
            {saving && <Loader2 className="animate-spin" />} Registrar compra
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
