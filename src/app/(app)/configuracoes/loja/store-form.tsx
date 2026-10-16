"use client";

import { Controller } from "react-hook-form";
import { toastFirstError, useZodForm } from "@/components/shared/use-zod-form";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FormField, MaskedInput } from "@/components/shared/inputs";
import { useCep } from "@/components/shared/use-cep";
import { storeSchema, type StoreInput } from "@/features/settings/schemas";
import { saveStoreSettings } from "@/features/settings/actions";

export function StoreForm({ defaults }: { defaults: StoreInput }) {
  const form = useZodForm(storeSchema, {
    defaultValues: defaults });
  const { register, control, handleSubmit, setValue, formState } = form;
  const errors = formState.errors;
  const cep = useCep((a) => {
    setValue("street", a.street);
    setValue("district", a.district);
    setValue("city", a.city);
    setValue("state", a.state);
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await saveStoreSettings(values);
    if (res.ok) toast.success("Dados da loja salvos");
    else toast.error(res.error);
  }, toastFirstError);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
          <CardDescription>Aparece nos recibos, termos de garantia e mensagens.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome fantasia" required error={errors.name?.message}>
            <Input {...register("name")} />
          </FormField>
          <FormField label="Razão social">
            <Input {...register("legalName")} />
          </FormField>
          <FormField label="CNPJ" error={errors.cnpj?.message}>
            <Controller control={control} name="cnpj" render={({ field }) => <MaskedInput mask="cpfCnpj" {...field} />} />
          </FormField>
          <FormField label="URL do logo" hint="Link de uma imagem (PNG/JPG). Ex.: /logo.png">
            <Input {...register("logoUrl")} placeholder="https://…" />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato e redes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Telefone" error={errors.phone?.message}>
            <Controller control={control} name="phone" render={({ field }) => <MaskedInput mask="phone" {...field} />} />
          </FormField>
          <FormField label="WhatsApp" error={errors.whatsapp?.message}>
            <Controller control={control} name="whatsapp" render={({ field }) => <MaskedInput mask="phone" {...field} />} />
          </FormField>
          <FormField label="E-mail" error={errors.email?.message}>
            <Input type="email" {...register("email")} />
          </FormField>
          <FormField label="Instagram">
            <Input {...register("instagram")} placeholder="@sualoja" />
          </FormField>
          <FormField label="Site">
            <Input {...register("website")} />
          </FormField>
          <FormField label="Link de avaliação no Google" hint="Usado na mensagem de pedido de avaliação.">
            <Input {...register("googleReviewUrl")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-6">
          <FormField label="CEP" className="sm:col-span-2" error={errors.cep?.message} hint={cep.loading ? "Buscando…" : undefined}>
            <Controller
              control={control}
              name="cep"
              render={({ field }) => (
                <MaskedInput
                  mask="cep"
                  {...field}
                  onChange={(v) => {
                    field.onChange(v);
                    if (v.replace(/\D/g, "").length === 8) cep.lookup(v);
                  }}
                />
              )}
            />
          </FormField>
          <FormField label="Rua" className="sm:col-span-4">
            <Input {...register("street")} />
          </FormField>
          <FormField label="Número" className="sm:col-span-1">
            <Input {...register("number")} />
          </FormField>
          <FormField label="Complemento" className="sm:col-span-2">
            <Input {...register("complement")} />
          </FormField>
          <FormField label="Bairro" className="sm:col-span-3">
            <Input {...register("district")} />
          </FormField>
          <FormField label="Cidade" className="sm:col-span-4">
            <Input {...register("city")} />
          </FormField>
          <FormField label="UF" className="sm:col-span-2">
            <Input maxLength={2} {...register("state")} />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  );
}
