import "server-only";
import { db, parseJson } from "@/lib/db";
import type { DocHeader } from "@/components/documents/doc-body";

export async function loadDocument(id: string) {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return null;
  const data = parseJson<{ loja?: Record<string, string>; cliente?: { nome?: string; telefone?: string } }>(doc.data, {});
  const loja = data.loja ?? {};
  const header: DocHeader = {
    nome: loja.nome ?? "",
    cnpj: loja.cnpj,
    endereco: loja.endereco,
    telefone: loja.telefone,
    whatsapp: loja.whatsapp,
    instagram: loja.instagram,
    email: loja.email,
    logo: loja.logo,
  };
  const customer = doc.customerId ? await db.customer.findUnique({ where: { id: doc.customerId }, select: { name: true, phone: true } }) : null;
  return { doc, header, signerName: customer?.name ?? data.cliente?.nome ?? "Cliente", customerPhone: customer?.phone ?? null };
}
