"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { ImeiField } from "@/components/shared/imei-field";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { toastFirstError, useZodForm } from "@/components/shared/use-zod-form";
import { DEVICE_CONDITION, DEVICE_STATUS, GRADES } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/format";
import { deviceSchema, type DeviceInput } from "@/features/devices/schemas";
import { saveDevice } from "@/features/devices/actions";
import type { CatalogItem } from "@/features/devices/queries";

export function DeviceForm({
  catalog,
  suppliers,
  defaults,
}: {
  catalog: CatalogItem[];
  suppliers: { id: string; name: string }[];
  defaults?: DeviceInput;
}) {
  const router = useRouter();
  const isEdit = !!defaults?.id;
  const form = useZodForm(deviceSchema, {
    defaultValues: defaults ?? {
      imei: "",
      imei2: "",
      serial: "",
      modelId: "",
      capacity: "",
      color: "",
      condition: "SEMINOVO",
      batteryHealth: "",
      grade: "A",
      notes: "",
      photos: [],
      supplierId: "",
      acquisitionCost: 0,
      salePrice: 0,
      entryDate: new Date().toISOString().slice(0, 10),
      appleWarrantyUntil: "",
      status: "DISPONIVEL",
    },
  });
  const { register, control, handleSubmit, watch, setValue, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  const modelId = watch("modelId") as string;
  const condition = watch("condition") as string;
  const cost = Number(watch("acquisitionCost") ?? 0);
  const price = Number(watch("salePrice") ?? 0);
  const model = useMemo(() => catalog.find((m) => m.id === modelId), [catalog, modelId]);
  const families = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const m of catalog) map.set(m.family, [...(map.get(m.family) ?? []), m]);
    return [...map.entries()];
  }, [catalog]);

  const margin = price - cost;

  const onSubmit = handleSubmit(async (values) => {
    const res = await saveDevice({ ...values, id: defaults?.id });
    if (!res.ok) return toast.error(res.error);
    toast.success(isEdit ? "Aparelho atualizado" : "Aparelho cadastrado no estoque");
    router.push(`/estoque/aparelhos/${res.data.id}`);
    router.refresh();
  }, toastFirstError);

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="IMEI" required error={errors.imei?.message} className="sm:col-span-2">
              <Controller
                control={control}
                name="imei"
                render={({ field }) => (
                  <ImeiField
                    value={String(field.value ?? "")}
                    onChange={field.onChange}
                    ignoreId={defaults?.id}
                    checkable
                    checkDeviceId={defaults?.id}
                    autoFocus={!isEdit}
                    onLookup={(r) => {
                      if (r.tacModel && !form.getValues("modelId")) setValue("modelId", r.tacModel.id);
                    }}
                  />
                )}
              />
            </FormField>
            <FormField label="IMEI 2 (eSIM/2º chip)" error={errors.imei2?.message}>
              <Input inputMode="numeric" className="font-mono" {...register("imei2")} maxLength={15} />
            </FormField>
            <FormField label="Número de série">
              <Input className="font-mono uppercase" {...register("serial")} />
            </FormField>
            <FormField label="Modelo" required error={errors.modelId?.message} className="sm:col-span-2">
              <NativeSelect
                {...register("modelId", {
                  onChange: () => {
                    setValue("capacity", "");
                    setValue("color", "");
                  },
                })}
                className="h-9"
              >
                <option value="">Selecione…</option>
                {families.map(([family, models]) => (
                  <optgroup key={family} label={family}>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Capacidade" required error={errors.capacity?.message} className="sm:col-span-2">
              <Controller
                control={control}
                name="capacity"
                render={({ field }) => (
                  <ChipGroup options={model?.capacities ?? []} value={String(field.value ?? "")} onChange={field.onChange} empty="Escolha o modelo" />
                )}
              />
            </FormField>
            <FormField label="Cor" required error={errors.color?.message} className="sm:col-span-2">
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <ChipGroup options={model?.colors ?? []} value={String(field.value ?? "")} onChange={field.onChange} empty="Escolha o modelo" />
                )}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado do aparelho</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Condição" required className="sm:col-span-2">
              <Controller
                control={control}
                name="condition"
                render={({ field }) => (
                  <ChipGroup
                    options={DEVICE_CONDITION.list.map((c) => c.value)}
                    labels={Object.fromEntries(DEVICE_CONDITION.list.map((c) => [c.value, c.label]))}
                    value={String(field.value)}
                    onChange={field.onChange}
                  />
                )}
              />
            </FormField>
            <FormField label="Saúde da bateria (%)" error={errors.batteryHealth?.message} hint={condition === "NOVO" ? "Novo lacrado: 100%" : undefined}>
              <Input type="number" min={0} max={100} {...register("batteryHealth")} />
            </FormField>
            <FormField label="Grade estético">
              <NativeSelect {...register("grade")} className="h-9">
                <option value="">—</option>
                {GRADES.list.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Observações" className="sm:col-span-2">
              <Textarea rows={3} {...register("notes")} placeholder="Riscos, peças trocadas, acompanha caixa/cabo…" />
            </FormField>
            <FormField label="Fotos" className="sm:col-span-2">
              <Controller
                control={control}
                name="photos"
                render={({ field }) => <PhotoUpload value={(field.value as string[]) ?? []} onChange={field.onChange} />}
              />
            </FormField>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Valores</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField label="Custo de aquisição" error={errors.acquisitionCost?.message}>
              <Controller control={control} name="acquisitionCost" render={({ field }) => <MoneyInput value={Number(field.value)} onChange={field.onChange} />} />
            </FormField>
            <FormField label="Preço de venda sugerido" error={errors.salePrice?.message}>
              <Controller control={control} name="salePrice" render={({ field }) => <MoneyInput value={Number(field.value)} onChange={field.onChange} />} />
            </FormField>
            <div className="rounded-xl bg-muted/60 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Margem bruta</span>
                <span className={cn("font-semibold tabular", margin < 0 && "text-destructive")}>{formatBRL(margin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Margem %</span>
                <span className="tabular">{formatPct(price ? (margin / price) * 100 : 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Origem e garantia</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField label="Fornecedor">
              <NativeSelect {...register("supplierId")} className="h-9">
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Data de entrada">
              <Input type="date" {...register("entryDate")} />
            </FormField>
            <FormField label="Garantia Apple até" hint="Consulte em checkcoverage.apple.com">
              <Input type="date" {...register("appleWarrantyUntil")} />
            </FormField>
            <FormField label="Status">
              <NativeSelect {...register("status")} className="h-9">
                {DEVICE_STATUS.list
                  .filter((s) => ["DISPONIVEL", "EM_AVALIACAO", "DEVOLVIDO"].includes(s.value) || s.value === defaults?.status)
                  .map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="h-11" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
          {isEdit ? "Salvar alterações" : "Cadastrar no estoque"}
        </Button>
      </div>
    </form>
  );
}

function ChipGroup({
  options,
  labels,
  value,
  onChange,
  empty,
}: {
  options: string[];
  labels?: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
  empty?: string;
}) {
  if (!options.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm transition",
            value === o ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
          )}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
