"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Save, Search, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { StatusBadge } from "@/components/shared/status-badge";
import { ImeiField } from "@/components/shared/imei-field";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { CustomerPicker, type PickedCustomer } from "@/components/forms/customer-picker";
import { DeviceChecklist, emptyChecklist } from "@/components/forms/device-checklist";
import { DEVICE_STATUS, SO_PRIORITY } from "@/domain/constants";
import { cn } from "@/lib/utils";
import { createServiceOrderAction } from "@/features/service-orders/actions";
import { imeiText } from "@/lib/format";

type DeviceOption = { id: string; label: string; imei: string | null; status: string; battery: number | null };

export function NewServiceOrderForm({
  technicians,
  devices,
  defaultDeviceId,
  defaultCustomer,
  defaultTechnicianId,
}: {
  technicians: { id: string; name: string; role: string }[];
  devices: DeviceOption[];
  defaultDeviceId: string | null;
  defaultCustomer: PickedCustomer | null;
  defaultTechnicianId: string | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"INTERNA" | "CLIENTE">(defaultCustomer ? "CLIENTE" : "INTERNA");
  const [deviceId, setDeviceId] = useState<string | null>(defaultDeviceId);
  const [deviceQ, setDeviceQ] = useState("");
  const [customer, setCustomer] = useState<PickedCustomer | null>(defaultCustomer);
  const [imei, setImei] = useState("");
  const [linked, setLinked] = useState<{ id: string; name: string; status: string } | null>(null);
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState("");
  const [services, setServices] = useState("");
  const [technicianId, setTechnicianId] = useState(defaultTechnicianId ?? "");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [price, setPrice] = useState(0);
  const [checklist, setChecklist] = useState(emptyChecklist);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const selected = devices.find((d) => d.id === deviceId);
  const matches = useMemo(() => {
    const term = deviceQ.trim().toLowerCase();
    const list = term ? devices.filter((d) => `${d.label} ${d.imei ?? ""}`.toLowerCase().includes(term)) : devices;
    return list.slice(0, 8);
  }, [devices, deviceQ]);

  async function submit() {
    setSaving(true);
    const res = await createServiceOrderAction({
      kind,
      deviceId: kind === "INTERNA" ? deviceId : (linked?.id ?? null),
      deviceDescription: kind === "CLIENTE" ? description || linked?.name || null : null,
      imei: kind === "CLIENTE" ? imei.replace(/\D/g, "") || null : null,
      customerId: kind === "CLIENTE" ? (customer?.id ?? null) : null,
      technicianId: technicianId || null,
      problem,
      services,
      priority: priority as "NORMAL",
      dueDate,
      price: kind === "CLIENTE" ? price : 0,
      checklist: kind === "CLIENTE" ? checklist : {},
      photos,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`OS #${res.data.number} aberta`);
    router.push(`/os/${res.data.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
          {(
            [
              { value: "INTERNA", label: "Interna", hint: "Preparar aparelho do estoque" },
              { value: "CLIENTE", label: "De cliente", hint: "Reparo de aparelho do cliente" },
            ] as const
          ).map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn("rounded-xl px-3 py-2.5 text-left transition", kind === k.value ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <span className="block text-sm font-medium">{k.label}</span>
              <span className="block text-xs text-muted-foreground">{k.hint}</span>
            </button>
          ))}
        </div>

        {kind === "INTERNA" ? (
          <Card>
            <CardHeader>
              <CardTitle>Aparelho do estoque</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {selected ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
                  <span className="flex items-center gap-3">
                    <Smartphone className="size-5 text-primary" />
                    <span>
                      <span className="block font-medium">{selected.label}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{imeiText(selected.imei)}</span>
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setDeviceId(null)} aria-label="Trocar aparelho">
                    <X />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input autoFocus value={deviceQ} onChange={(e) => setDeviceQ(e.target.value)} placeholder="Modelo, cor ou IMEI…" className="h-11 pl-9" />
                  </div>
                  <div className="divide-y rounded-xl border">
                    {matches.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum aparelho disponível encontrado.</p>}
                    {matches.map((d) => (
                      <button key={d.id} type="button" onClick={() => setDeviceId(d.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted">
                        <span>
                          <span className="block font-medium">{d.label}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {d.imei ?? "Sem IMEI"}
                            {d.battery != null && ` · bateria ${d.battery}%`}
                          </span>
                        </span>
                        <StatusBadge value={d.status} options={DEVICE_STATUS} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="text-xs text-muted-foreground">O aparelho fica “Em manutenção” e não pode ser vendido até a OS ser concluída.</p>
            </CardContent>
          </Card>
        ) : (
          <>
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
                <CardTitle>Aparelho do cliente</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="IMEI">
                  <ImeiField
                    value={imei}
                    onChange={(v) => {
                      setImei(v);
                      if (linked) setLinked(null);
                    }}
                    ignoreId={linked?.id}
                    onLookup={(r) => setLinked(r.existing && !r.existing.deleted ? r.existing : null)}
                  />
                </FormField>
                <FormField label="Aparelho" required={!linked} hint={linked ? `Reconhecido no sistema: ${linked.name} (${DEVICE_STATUS.label(linked.status)})${linked.status === "VENDIDO" ? " — vendido pela loja" : ""}` : "Ex.: iPhone 13 128GB azul"}>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={linked?.name ?? "Modelo, capacidade e cor"} />
                </FormField>
                <div className="sm:col-span-2">
                  <p className="mb-2 text-[13px] text-muted-foreground">Checklist de entrada (como o aparelho chegou)</p>
                  <DeviceChecklist value={checklist} onChange={setChecklist} />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Serviço</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Defeito / motivo" required className="sm:col-span-2">
              <Textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder={kind === "INTERNA" ? "Ex.: trocar bateria (78%), limpeza e película" : "Ex.: tela quebrada, não carrega"} />
            </FormField>
            <FormField label="Serviços a executar" className="sm:col-span-2">
              <Textarea rows={2} value={services} onChange={(e) => setServices(e.target.value)} />
            </FormField>
            <FormField label="Fotos" className="sm:col-span-2">
              <PhotoUpload value={photos} onChange={setPhotos} folder="os" />
            </FormField>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Andamento</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Técnico responsável">
            <NativeSelect value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="h-9">
              <option value="">Não atribuído</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Prioridade">
            <div className="grid grid-cols-4 gap-1">
              {SO_PRIORITY.list.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn("flex h-9 items-center justify-center gap-1 rounded-lg border text-xs", priority === p.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
                >
                  {priority === p.value && <Check className="size-3" />}
                  {p.label}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Prazo">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          {kind === "CLIENTE" && (
            <FormField label="Valor a cobrar (orçamento)" hint="Pode ajustar depois do diagnóstico.">
              <MoneyInput value={price} onChange={setPrice} />
            </FormField>
          )}
          <Button size="lg" className="h-11" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Abrir OS
          </Button>
          {kind === "CLIENTE" && <p className="text-xs text-muted-foreground">Um comprovante de entrada é gerado para o cliente assinar.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
