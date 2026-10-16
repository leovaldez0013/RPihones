import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "@/features/documents/defaults";
import { sampleContext, storeContext } from "@/features/documents/context";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Modelos de documentos" };

export default async function TemplatesPage() {
  await requirePage("settings.operational");
  const [saved, store] = await Promise.all([db.documentTemplate.findMany(), storeContext(db)]);
  const templates = Object.entries(DEFAULT_TEMPLATES).map(([type, def]) => {
    const t = saved.find((s) => s.type === type);
    return { type, name: t?.name ?? def.name, content: t?.content ?? def.content, custom: !!t && t.content !== def.content };
  });
  // usa os dados reais da loja na pré-visualização
  const sample = { ...sampleContext(), ...store };
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader back="/configuracoes" title="Modelos de documentos" description="Edite os textos com variáveis. Documentos já emitidos não mudam." />
      <TemplateEditor templates={templates} sample={sample} />
    </div>
  );
}
