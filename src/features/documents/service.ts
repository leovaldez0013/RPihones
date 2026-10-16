// Criação de documentos: aplica o modelo ao contexto e guarda um "retrato" (o documento
// emitido não muda se o modelo for editado depois).
import { createHmac } from "node:crypto";
import type { Tx } from "@/lib/db";
import { nextSequence } from "@/lib/db";
import { renderTemplate } from "@/domain/template";
import { DOCUMENT_TYPE } from "@/domain/constants";
import { DEFAULT_TEMPLATES } from "./defaults";
import { orderContext, saleContext, serviceOrderContext, storeContext, tradeInContext, usedPurchaseContext, type DocCtx } from "./context";

export async function getTemplate(tx: Tx, type: string) {
  const t = await tx.documentTemplate.findUnique({ where: { type } });
  if (t) return t;
  const def = DEFAULT_TEMPLATES[type];
  return { id: null as string | null, type, name: def?.name ?? DOCUMENT_TYPE.label(type), content: def?.content ?? "" };
}

type Links = { saleId?: string; serviceOrderId?: string; orderId?: string; tradeInId?: string; usedPurchaseId?: string; customerId?: string | null };

export async function createDocument(tx: Tx, type: string, ctx: DocCtx, links: Links, userId?: string | null, title?: string) {
  const template = await getTemplate(tx, type);
  const number = await nextSequence(tx, `DOC_${type}`);
  const full = { ...(await storeContext(tx)), ...ctx, documento: { numero: number, titulo: title ?? template.name } };
  const { text } = renderTemplate(template.content, full);
  return tx.document.create({
    data: {
      type,
      number,
      title: title ?? template.name,
      templateId: template.id,
      content: text,
      data: JSON.stringify(full),
      saleId: links.saleId,
      serviceOrderId: links.serviceOrderId,
      orderId: links.orderId,
      tradeInId: links.tradeInId,
      usedPurchaseId: links.usedPurchaseId,
      customerId: links.customerId ?? null,
      createdById: userId ?? null,
    },
  });
}

/** Recibo + garantia + termo de cada aparelho recebido na troca (idempotente). */
export async function generateSaleDocs(tx: Tx, saleId: string, userId: string) {
  const existing = await tx.document.findMany({ where: { saleId }, select: { type: true, tradeInId: true } });
  const has = (type: string, tradeInId?: string) => existing.some((d) => d.type === type && (tradeInId ? d.tradeInId === tradeInId : true));
  const { ctx, customerId, number } = await saleContext(tx, saleId);
  if (!has("RECIBO")) await createDocument(tx, "RECIBO", ctx, { saleId, customerId }, userId, `Recibo — venda #${number}`);
  if (!has("GARANTIA")) await createDocument(tx, "GARANTIA", ctx, { saleId, customerId }, userId, `Termo de garantia — venda #${number}`);
  const trades = await tx.tradeIn.findMany({ where: { saleId, deviceId: { not: null } } });
  for (const t of trades) {
    if (has("TERMO_TROCA", t.id)) continue;
    const tc = await tradeInContext(tx, t.id);
    await createDocument(tx, "TERMO_TROCA", tc.ctx, { saleId, tradeInId: t.id, customerId: tc.customerId }, userId, `Termo de recebimento (troca) — venda #${number}`);
  }
}

export async function generateQuoteDoc(tx: Tx, saleId: string, userId: string) {
  const { ctx, customerId, number } = await saleContext(tx, saleId);
  return createDocument(tx, "ORCAMENTO", ctx, { saleId, customerId }, userId, `Orçamento #${number}`);
}

export async function generateUsedPurchaseDoc(tx: Tx, usedPurchaseId: string, userId: string) {
  const { ctx, customerId } = await usedPurchaseContext(tx, usedPurchaseId);
  const p = await tx.usedDevicePurchase.findUniqueOrThrow({ where: { id: usedPurchaseId } });
  return createDocument(tx, "TERMO_TROCA", ctx, { usedPurchaseId, customerId }, userId, `Termo de compra de aparelho usado nº ${p.number}`);
}

export async function generateOrderDoc(tx: Tx, orderId: string, userId: string) {
  const { ctx, customerId } = await orderContext(tx, orderId);
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  return createDocument(tx, "ENCOMENDA", ctx, { orderId, customerId }, userId, `Comprovante de encomenda #${o.number}`);
}

export async function generateServiceOrderDoc(tx: Tx, soId: string, type: "OS_ENTRADA" | "OS_ENTREGA", userId: string) {
  const { ctx, customerId } = await serviceOrderContext(tx, soId);
  const o = await tx.serviceOrder.findUniqueOrThrow({ where: { id: soId } });
  return createDocument(tx, type, ctx, { serviceOrderId: soId, customerId }, userId, `${type === "OS_ENTRADA" ? "OS — entrada" : "OS — entrega"} #${o.number}`);
}

// ── Link público assinado (para enviar ao cliente pelo WhatsApp) ──

export function shareSignature(documentId: string): string {
  const secret = process.env.AUTH_SECRET ?? "dev-secret";
  return createHmac("sha256", secret).update(`doc:${documentId}`).digest("base64url").slice(0, 24);
}

export function verifyShare(documentId: string, sig: string): boolean {
  const expected = shareSignature(documentId);
  return sig.length === expected.length && expected === sig;
}
