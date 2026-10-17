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
import { PhotoUpload } from "@/components/shared/photo-upload";
import { SO_PRIORITY } from "@/domain/constants";
import { updateServiceOrderAction } from "@/features/service-orders/actions";

type SoForm = {
  id: string;
  kind: string;
  problem: string;
  services: string;
  diagnosis: string;
  laborCost: number;
  price: number;
  priority: string;
  technicianId: string;
  dueDate: string;
  checklist: Record<string, boolean>;
  photos: string[];
};

export function SoEditForm({ so, readOnly, showCost, technicians }: { so: SoForm; readOnly: boolean; showCost: boolean; technicians: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState(so);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof SoForm>(k: K, val: SoForm[K]) => setV((p) => ({ ...p, [k]: val }));
  const dirty = JSON.stringify(v) !== JSON.stringify(so);

  async function save() {
    setSaving(true);
    const res = await updateServiceOrderAction({ ...v, priority: v.priority as "NORMAL", technicianId: v.technicianId || null });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("OS salva");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Serviço</CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <FormField label="Defeito / motivo" className="sm:col-span-2">
          <Textarea rows={2} value={v.problem} disabled={readOnly} onChange={(e) => set("problem", e.target.value)} />
        </FormField>
        <FormField label="Diagnóstico" className="sm:col-span-2">
          <Textarea rows={2} value={v.diagnosis} disabled={readOnly} onChange={(e) => set("diagnosis", e.target.value)} placeholder="O que o técnico encontrou" />
        </FormField>
        <FormField label="Serviços executados" className="sm:col-span-2">
          <Textarea rows={2} value={v.services} disabled={readOnly} onChange={(e) => set("services", e.target.value)} />
        </FormField>
        <FormField label="Técnico">
          <NativeSelect value={v.technicianId} disabled={readOnly} onChange={(e) => set("technicianId", e.target.value)} className="h-9">
            <option value="">Não atribuído</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Prioridade">
          <NativeSelect value={v.priority} disabled={readOnly} onChange={(e) => set("priority", e.target.value)} className="h-9">
            {SO_PRIORITY.list.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Prazo">
          <Input type="date" value={v.dueDate} disabled={readOnly} onChange={(e) => set("dueDate", e.target.value)} />
        </FormField>
        {showCost && (
          <FormField label="Mão de obra (custo interno)">
            <MoneyInput value={v.laborCost} disabled={readOnly} onChange={(n) => set("laborCost", n)} />
          </FormField>
        )}
        {so.kind === "CLIENTE" && (
          <FormField label="Valor cobrado do cliente" hint="Total do serviço, incluindo peças.">
            <MoneyInput value={v.price} disabled={readOnly} onChange={(n) => set("price", n)} />
          </FormField>
        )}
        <FormField label="Fotos" className="sm:col-span-2">
          {readOnly ? (
            v.photos.length ? (
              <div className="flex flex-wrap gap-2">
                {v.photos.map((p) => (
                  <a key={p} href={p} target="_blank" rel="noreferrer" className="size-20 overflow-hidden rounded-xl border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="size-full object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem fotos.</p>
            )
          ) : (
            <PhotoUpload value={v.photos} onChange={(p) => set("photos", p)} folder="os" />
          )}
        </FormField>
      </CardContent>
    </Card>
  );
}
