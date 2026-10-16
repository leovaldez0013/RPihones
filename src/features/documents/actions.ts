"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { audit } from "@/lib/audit";
import { generateQuoteDoc } from "./service";
import { DEFAULT_TEMPLATES } from "./defaults";

export const saveSignatureAction = action(
  {
    schema: z.object({
      id: z.string(),
      signature: z
        .string()
        .startsWith("data:image/png;base64,", "Assinatura inválida")
        .max(400_000, "Assinatura muito grande"),
    }),
    permission: "documents.view",
  },
  async ({ id, signature }, { user }) => {
    await db.$transaction(async (tx) => {
      const d = await tx.document.findUniqueOrThrow({ where: { id } });
      if (d.signature) throw new BusinessError("Este documento já foi assinado.");
      await tx.document.update({ where: { id }, data: { signature, signedAt: new Date() } });
      await audit(tx, { userId: user.id, action: "document.sign", entity: "Document", entityId: id, summary: `${d.title} assinado na tela` });
    });
    revalidatePath(`/documentos/${id}`);
    return true;
  },
);

export const generateQuoteDocAction = action({ schema: z.object({ saleId: z.string() }), permission: "sales.create" }, async ({ saleId }, { user }) => {
  const doc = await db.$transaction((tx) => generateQuoteDoc(tx, saleId, user.id));
  return { id: doc.id };
});

export const saveTemplateAction = action(
  { schema: z.object({ type: z.string(), name: z.string().min(2), content: z.string().min(10, "Modelo muito curto") }), permission: "settings.operational" },
  async ({ type, name, content }, { user }) => {
    if (!DEFAULT_TEMPLATES[type]) throw new BusinessError("Tipo de documento desconhecido.");
    await db.$transaction(async (tx) => {
      await tx.documentTemplate.upsert({ where: { type }, create: { type, name, content }, update: { name, content } });
      await audit(tx, { userId: user.id, action: "template.update", entity: "DocumentTemplate", entityId: type, summary: `Modelo "${name}" atualizado` });
    });
    revalidatePath("/configuracoes/documentos");
    return true;
  },
);

export const resetTemplateAction = action({ schema: z.object({ type: z.string() }), permission: "settings.operational" }, async ({ type }, { user }) => {
  const def = DEFAULT_TEMPLATES[type];
  if (!def) throw new BusinessError("Tipo de documento desconhecido.");
  await db.$transaction(async (tx) => {
    await tx.documentTemplate.upsert({ where: { type }, create: { type, ...def }, update: def });
    await audit(tx, { userId: user.id, action: "template.reset", entity: "DocumentTemplate", entityId: type, summary: `Modelo "${def.name}" restaurado ao padrão` });
  });
  revalidatePath("/configuracoes/documentos");
  return def;
});
