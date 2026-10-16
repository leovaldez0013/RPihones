"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DocBody, type DocHeader } from "@/components/documents/doc-body";
import { listVariables, renderTemplate, type TemplateContext } from "@/domain/template";
import { cn } from "@/lib/utils";
import { resetTemplateAction, saveTemplateAction } from "@/features/documents/actions";

type T = { type: string; name: string; content: string; custom: boolean };

const GROUPS_BY_TYPE: Record<string, string[]> = {
  RECIBO: ["loja", "cliente", "venda", "aparelho", "data_hoje", "data_hoje_extenso", "documento"],
  GARANTIA: ["loja", "cliente", "venda", "aparelho", "garantia", "data_hoje", "data_hoje_extenso", "documento"],
  TERMO_TROCA: ["loja", "cliente", "troca", "data_hoje", "data_hoje_extenso", "documento"],
  ENCOMENDA: ["loja", "cliente", "encomenda", "data_hoje", "data_hoje_extenso", "documento"],
  OS_ENTRADA: ["loja", "cliente", "os", "data_hoje", "documento"],
  OS_ENTREGA: ["loja", "cliente", "os", "garantia", "data_hoje", "documento"],
  ORCAMENTO: ["loja", "cliente", "venda", "data_hoje", "documento"],
};

export function TemplateEditor({ templates, sample }: { templates: T[]; sample: TemplateContext }) {
  const [list, setList] = useState(templates);
  const [type, setType] = useState(templates[0].type);
  const current = list.find((t) => t.type === type)!;
  const [name, setName] = useState(current.name);
  const [content, setContent] = useState(current.content);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  function select(t: T) {
    setType(t.type);
    setName(t.name);
    setContent(t.content);
  }

  const vars = useMemo(() => {
    const groups = GROUPS_BY_TYPE[type] ?? [];
    return listVariables(sample).filter((v) => groups.some((g) => v === g || v.startsWith(`${g}.`)));
  }, [type, sample]);

  const preview = useMemo(() => renderTemplate(content, sample), [content, sample]);
  const loja = (sample.loja ?? {}) as Record<string, string>;
  const header: DocHeader = { nome: loja.nome, cnpj: loja.cnpj, endereco: loja.endereco, telefone: loja.telefone, whatsapp: loja.whatsapp, instagram: loja.instagram, email: loja.email, logo: loja.logo };

  function insert(text: string) {
    const el = area.current;
    if (!el) return setContent((c) => c + text);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function save() {
    setSaving(true);
    const res = await saveTemplateAction({ type, name, content });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    setList((l) => l.map((t) => (t.type === type ? { ...t, name, content, custom: true } : t)));
    toast.success("Modelo salvo — próximos documentos usarão este texto");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_1fr_1fr]">
      <nav className="flex gap-1.5 overflow-x-auto xl:flex-col">
        {list.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => select(t)}
            className={cn(
              "flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
              t.type === type ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {t.name}
            {t.custom && <span className={cn("size-1.5 rounded-full", t.type === type ? "bg-white" : "bg-primary")} title="Personalizado" />}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="font-medium" />
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="icon-lg" aria-label="Restaurar padrão">
                <RotateCcw />
              </Button>
            }
            title="Restaurar o modelo padrão?"
            description="O texto atual será substituído pelo modelo original do sistema."
            destructive={false}
            confirmLabel="Restaurar"
            onConfirm={async () => {
              const res = await resetTemplateAction({ type });
              if (!res.ok) return toast.error(res.error);
              setName(res.data.name);
              setContent(res.data.content);
              setList((l) => l.map((t) => (t.type === type ? { ...t, ...res.data, custom: false } : t)));
              toast.success("Modelo restaurado");
            }}
          />
          <Button size="lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        </div>
        <Textarea ref={area} value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[420px] font-mono text-xs leading-relaxed" spellCheck={false} />
        <div className="rounded-2xl border bg-card p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Info className="size-3.5" /> Clique para inserir. Use **negrito**, # títulos, - listas, tabelas com | e ---. Blocos de assinatura:
          </p>
          <div className="flex flex-wrap gap-1">
            {["assinatura_cliente", "assinatura_loja", ...vars].map((v) => (
              <button key={v} type="button" onClick={() => insert(v.startsWith("assinatura") ? `\n{{${v}}}\n` : `{{${v}}}`)} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-primary hover:text-primary-foreground">
                {v}
              </button>
            ))}
          </div>
          {preview.missing.length > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Variáveis desconhecidas: {preview.missing.map((m) => <StatusBadge key={m} tone="amber" className="mr-1 h-5">{m}</StatusBadge>)}
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Pré-visualização (dados de exemplo)</p>
        <div className="max-h-[80vh] overflow-y-auto rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-800">
          <DocBody content={preview.text} header={header} signerName={String((sample.cliente as Record<string, string>)?.nome ?? "Cliente")} className="origin-top text-[11px]" />
        </div>
      </div>
    </div>
  );
}
