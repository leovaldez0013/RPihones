"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { renderTemplate } from "@/domain/template";
import { messageContext } from "@/domain/marketing";
import { cn } from "@/lib/utils";
import { resetMessageTemplateAction, saveMessageTemplateAction } from "@/features/marketing/actions";

type Tpl = { key: string; name: string; content: string; requiresConsent: boolean; customized: boolean };

const VARIABLES = [
  { v: "cliente.primeiro_nome", label: "Primeiro nome" },
  { v: "cliente.nome", label: "Nome completo" },
  { v: "aparelho", label: "Último aparelho" },
  { v: "garantia.ate", label: "Fim da garantia" },
  { v: "loja.nome", label: "Nome da loja" },
  { v: "avaliacao", label: "Link de avaliação" },
];

export function TemplatesEditor({ templates, store, canEdit }: { templates: Tpl[]; store: { name: string; reviewUrl: string | null }; canEdit: boolean }) {
  const [selected, setSelected] = useState(templates[0].key);
  const t = templates.find((x) => x.key === selected)!;
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div className="flex gap-1.5 overflow-x-auto lg:flex-col">
        {templates.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setSelected(x.key)}
            className={cn("flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition", x.key === selected ? "bg-card font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted")}
          >
            {x.name}
            {x.customized && <span className="size-1.5 rounded-full bg-primary" aria-label="personalizado" />}
          </button>
        ))}
      </div>
      <Editor key={t.key + t.content} t={t} store={store} canEdit={canEdit} />
    </div>
  );
}

function Editor({ t, store, canEdit }: { t: Tpl; store: { name: string; reviewUrl: string | null }; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(t.name);
  const [content, setContent] = useState(t.content);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const sample = messageContext({ name: "Maria da Silva", lastDevice: "iPhone 15 Pro 256GB", warrantyUntil: new Date(Date.now() + 20 * 86400000) }, { name: store.name, reviewUrl: store.reviewUrl ?? "https://g.page/r/sua-loja/review" }, (d) => d.toLocaleDateString("pt-BR"));
  const preview = renderTemplate(content, sample).text.trim();

  function insert(v: string) {
    const el = ref.current;
    const token = `{{${v}}}`;
    if (!el) return setContent((c) => c + token);
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    setContent(content.slice(0, start) + token + content.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Editar</CardTitle>
          <StatusBadge tone={t.requiresConsent ? "amber" : "blue"}>{t.requiresConsent ? "Marketing — exige consentimento" : "Relacionamento"}</StatusBadge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} aria-label="Nome do modelo" />
          <Textarea ref={ref} rows={8} value={content} onChange={(e) => setContent(e.target.value)} disabled={!canEdit} aria-label="Texto da mensagem" />
          {canEdit && (
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button key={v.v} type="button" onClick={() => insert(v.v)} className="rounded-full border bg-card px-2.5 py-1 text-xs hover:bg-muted">
                  + {v.label}
                </button>
              ))}
            </div>
          )}
          {canEdit ? (
            <div className="flex flex-wrap justify-end gap-2">
              {t.customized && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const res = await resetMessageTemplateAction({ key: t.key });
                    setBusy(false);
                    if (!res.ok) return toast.error(res.error);
                    toast.success("Modelo restaurado ao padrão");
                    router.refresh();
                  }}
                >
                  <RotateCcw /> Restaurar padrão
                </Button>
              )}
              <Button
                disabled={busy || (name === t.name && content === t.content)}
                onClick={async () => {
                  setBusy(true);
                  const res = await saveMessageTemplateAction({ key: t.key, name, content });
                  setBusy(false);
                  if (!res.ok) return toast.error(res.error);
                  toast.success("Modelo salvo");
                  router.refresh();
                }}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Somente gerente ou administrador pode alterar os modelos.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Prévia no WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl bg-[#e5ddd5] p-4 dark:bg-[#0b141a]">
            <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm whitespace-pre-wrap text-zinc-900 shadow-sm dark:bg-[#005c4b] dark:text-zinc-100">{preview}</div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Exemplo com dados fictícios. No envio, cada cliente recebe com os próprios dados.</p>
        </CardContent>
      </Card>
    </div>
  );
}
