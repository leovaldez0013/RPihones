"use client";

import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FormField, MaskedInput } from "@/components/shared/inputs";
import { useCep } from "@/components/shared/use-cep";
import { toastFirstError, useZodForm } from "@/components/shared/use-zod-form";
import { customerSchema, type CustomerInput } from "@/features/customers/schemas";
import { saveCustomer } from "@/features/customers/actions";

export type SavedCustomer = { id: string; name: string; cpf: string | null; phone: string | null };

/** Formulário de cliente — usado no cadastro, no PDV, em OS e encomendas. `compact` esconde endereço. */
export function CustomerForm({
  defaults,
  onSaved,
  onCancel,
  compact,
}: {
  defaults?: Partial<CustomerInput>;
  onSaved: (c: SavedCustomer) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const form = useZodForm(customerSchema, {
    defaultValues: {
      name: "",
      cpf: "",
      phone: "",
      email: "",
      birthDate: "",
      cep: "",
      street: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      notes: "",
      marketingConsent: true,
      ...defaults,
    },
  });
  const { register, control, handleSubmit, setValue, formState } = form;
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const cep = useCep((a) => {
    setValue("street", a.street);
    setValue("district", a.district);
    setValue("city", a.city);
    setValue("state", a.state);
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await saveCustomer({ ...values, id: defaults?.id });
    if (!res.ok) return toast.error(res.error);
    toast.success(defaults?.id ? "Cliente atualizado" : "Cliente cadastrado");
    onSaved(res.data);
  }, toastFirstError);

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        onSubmit(e);
      }}
      className="grid gap-4 sm:grid-cols-6"
    >
      <FormField label="Nome completo" required error={errors.name?.message} className="sm:col-span-6">
        <Input {...register("name")} autoFocus />
      </FormField>
      <FormField label="CPF" error={errors.cpf?.message} className="sm:col-span-3">
        <Controller control={control} name="cpf" render={({ field }) => <MaskedInput mask="cpf" {...field} value={field.value as string} />} />
      </FormField>
      <FormField label="Telefone / WhatsApp" error={errors.phone?.message} className="sm:col-span-3">
        <Controller control={control} name="phone" render={({ field }) => <MaskedInput mask="phone" {...field} value={field.value as string} />} />
      </FormField>
      <FormField label="E-mail" error={errors.email?.message} className="sm:col-span-4">
        <Input type="email" {...register("email")} />
      </FormField>
      <FormField label="Data de nascimento" className="sm:col-span-2">
        <Input type="date" {...register("birthDate")} />
      </FormField>
      {!compact && (
        <>
          <FormField label="CEP" error={errors.cep?.message} hint={cep.loading ? "Buscando endereço…" : undefined} className="sm:col-span-2">
            <Controller
              control={control}
              name="cep"
              render={({ field }) => (
                <MaskedInput
                  mask="cep"
                  {...field}
                  value={field.value as string}
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
          <FormField label="Número" className="sm:col-span-2">
            <Input {...register("number")} />
          </FormField>
          <FormField label="Complemento" className="sm:col-span-4">
            <Input {...register("complement")} />
          </FormField>
          <FormField label="Bairro" className="sm:col-span-2">
            <Input {...register("district")} />
          </FormField>
          <FormField label="Cidade" className="sm:col-span-3">
            <Input {...register("city")} />
          </FormField>
          <FormField label="UF" className="sm:col-span-1">
            <Input maxLength={2} {...register("state")} />
          </FormField>
          <FormField label="Observações" className="sm:col-span-6">
            <Textarea rows={2} {...register("notes")} />
          </FormField>
        </>
      )}
      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm sm:col-span-6">
        <Controller control={control} name="marketingConsent" render={({ field }) => <Switch checked={!!field.value} onCheckedChange={field.onChange} className="mt-0.5" />} />
        <span>
          <span className="font-medium">Aceita receber mensagens</span> de pós-venda, aniversário e ofertas pelo WhatsApp/e-mail
          <span className="block text-xs text-muted-foreground">Consentimento LGPD — registrado com data. O cliente pode revogar a qualquer momento.</span>
        </span>
      </label>
      <div className="flex justify-end gap-2 sm:col-span-6">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="animate-spin" />}
          Salvar cliente
        </Button>
      </div>
    </form>
  );
}
