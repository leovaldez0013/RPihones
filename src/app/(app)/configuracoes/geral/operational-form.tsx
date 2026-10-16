"use client";

import { useZodForm } from "@/components/shared/use-zod-form";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FormField, NativeSelect } from "@/components/shared/inputs";
import { operationalSchema, type OperationalInput } from "@/features/settings/schemas";
import { saveOperationalSettings } from "@/features/settings/actions";

export function OperationalForm({ defaults }: { defaults: OperationalInput }) {
  const { register, handleSubmit, formState } = useZodForm(operationalSchema, {
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await saveOperationalSettings(values);
    if (res.ok) toast.success("Parâmetros salvos");
    else toast.error(res.error);
  });

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Alerta de aparelho parado (dias)"
            hint="Aparelhos em estoque há mais dias que isso aparecem em destaque."
            error={formState.errors.staleStockDays?.message}
          >
            <Input type="number" {...register("staleStockDays")} />
          </FormField>
          <FormField label="Status do aparelho recebido na troca" hint="Como ele entra no estoque ao concluir a venda.">
            <NativeSelect {...register("tradeInDefaultStatus")}>
              <option value="EM_AVALIACAO">Em avaliação/preparação</option>
              <option value="DISPONIVEL">Disponível para venda</option>
            </NativeSelect>
          </FormField>
          <FormField label="Mensagem de pós-venda após (dias)" hint="Gera a tarefa “como está o seu iPhone?”.">
            <Input type="number" {...register("postSaleDays")} />
          </FormField>
          <FormField label="Avisar garantia vencendo com antecedência de (dias)">
            <Input type="number" {...register("warrantyAlertDays")} />
          </FormField>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" size="lg" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
