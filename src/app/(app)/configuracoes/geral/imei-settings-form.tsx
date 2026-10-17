"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, NativeSelect } from "@/components/shared/inputs";
import { IMEI_PROVIDERS } from "@/features/imei/providers";
import { saveImeiSettings } from "@/features/imei/actions";

export function ImeiSettingsForm({ defaults }: { defaults: { provider: string; apiUrl: string; hasKey: boolean; envUrl: boolean; envKey: boolean } }) {
  const router = useRouter();
  const [provider, setProvider] = useState(defaults.provider);
  const [apiUrl, setApiUrl] = useState(defaults.apiUrl);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveImeiSettings({ provider: provider as "none", apiUrl, apiKey, clearKey });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Consulta de IMEI configurada");
    setApiKey("");
    setClearKey(false);
    router.refresh();
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Consulta de IMEI</CardTitle>
        <CardDescription>
          Serviço usado no “Teste de IMEI” para verificar bloqueio (perda/roubo), Buscar iPhone, operadora e garantia. A validação local (dígito verificador e modelo pelo TAC) funciona sempre, sem custo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <FormField label="Provedor" className="sm:col-span-2">
          <NativeSelect value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9">
            {IMEI_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {provider === "mock" && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 sm:col-span-2 dark:text-amber-300">
            Modo demonstração: nenhum serviço real é consultado. IMEIs com penúltimo dígito 9 aparecem como bloqueados e com 8 como “Buscar iPhone ativo”.
          </p>
        )}
        {provider === "http" && (
          <>
            <FormField
              label="Endereço da API"
              className="sm:col-span-2"
              hint={
                <>
                  Use <code>{"{imei}"}</code> onde o número deve entrar; sem isso, ele vai como <code>?imei=</code>.{defaults.envUrl && " Se ficar vazio, usa IMEI_API_URL do .env."}
                </>
              }
            >
              <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.seuprovedor.com/check?imei={imei}" />
            </FormField>
            <FormField
              label="Chave de acesso"
              className="sm:col-span-2"
              hint={defaults.hasKey ? "Há uma chave salva. Deixe em branco para mantê-la." : defaults.envKey ? "Sem chave salva: usa IMEI_API_KEY do .env." : "Enviada como Authorization: Bearer e X-API-Key."}
            >
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={defaults.hasKey ? "••••••••••••" : "Cole a chave do serviço"} />
                {defaults.hasKey && (
                  <Button type="button" variant={clearKey ? "destructive" : "outline"} onClick={() => setClearKey((c) => !c)}>
                    <KeyRound /> {clearKey ? "Será removida" : "Remover"}
                  </Button>
                )}
              </div>
            </FormField>
          </>
        )}
        <div className="flex justify-end sm:col-span-2">
          <Button size="lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
