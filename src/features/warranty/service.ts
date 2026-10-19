// Acionamento de garantia: registrar o problema → aprovar (abre OS "Garantia", valor zero) ou negar com motivo.
import type { Tx } from "@/lib/db";
import { nextSequence } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { createServiceOrder } from "@/features/service-orders/service";

const DAY = 86400000;

/** Situação da garantia em uma data: ativa, vencendo (≤ 7 dias), vencida ou cancelada. */
export function warrantyState(w: { status: string; endDate: Date }, now = new Date()): "ATIVA" | "VENCENDO" | "VENCIDA" | "CANCELADA" {
  if (w.status === "CANCELADA") return "CANCELADA";
  const left = w.endDate.getTime() - now.getTime();
  if (left < 0) return "VENCIDA";
  if (left <= 7 * DAY) return "VENCENDO";
  return "ATIVA";
}

export async function claimWarranty(tx: Tx, input: { warrantyId: string; problem: string }, userId: string) {
  const w = await tx.warranty.findUniqueOrThrow({ where: { id: input.warrantyId }, include: { claims: true } });
  const state = warrantyState(w);
  if (state === "CANCELADA") throw new BusinessError("Garantia cancelada (venda cancelada ou devolvida).");
  if (state === "VENCIDA") throw new BusinessError(`Garantia vencida em ${formatDate(w.endDate)}.`);
  if (w.claims.some((c) => c.status === "EM_ANALISE" || c.status === "APROVADO")) throw new BusinessError("Já existe um acionamento em andamento para esta garantia.");
  const claim = await tx.warrantyClaim.create({
    data: { number: await nextSequence(tx, "WARRANTY_CLAIM"), warrantyId: w.id, problem: input.problem, createdById: userId },
  });
  await audit(tx, { userId, action: "warranty.claim", entity: "WarrantyClaim", entityId: claim.id, summary: `Garantia #${w.number} acionada: ${input.problem}` });
  return claim;
}

/** Aprova: abre OS do tipo Garantia (valor zero, prioridade alta) vinculada ao acionamento. */
export async function approveClaim(tx: Tx, input: { claimId: string; note?: string | null }, userId: string) {
  const c = await tx.warrantyClaim.findUniqueOrThrow({ where: { id: input.claimId }, include: { warranty: true } });
  if (c.status !== "EM_ANALISE") throw new BusinessError("Este acionamento já foi decidido.");
  const w = c.warranty;
  const so = await createServiceOrder(
    tx,
    {
      kind: "GARANTIA",
      deviceId: w.deviceId,
      deviceDescription: w.deviceId ? null : w.description,
      modelId: null,
      color: null,
      imei: w.imei,
      customerId: w.customerId,
      technicianId: null,
      problem: `Garantia #${w.number}: ${c.problem}`,
      services: null,
      diagnosis: input.note ?? null,
      laborCost: 0,
      price: 0,
      priority: "ALTA",
      dueDate: new Date(Date.now() + 5 * DAY),
      checklist: {},
      photos: [],
    },
    userId,
  );
  await tx.warrantyClaim.update({ where: { id: c.id }, data: { status: "APROVADO", decisionNote: input.note ?? null, decidedAt: new Date(), decidedById: userId, serviceOrderId: so.id } });
  await audit(tx, { userId, action: "warranty.approve", entity: "WarrantyClaim", entityId: c.id, summary: `Acionamento #${c.number} aprovado — OS #${so.number}` });
  return so;
}

export async function denyClaim(tx: Tx, input: { claimId: string; reason: string }, userId: string) {
  const c = await tx.warrantyClaim.findUniqueOrThrow({ where: { id: input.claimId } });
  if (c.status !== "EM_ANALISE") throw new BusinessError("Este acionamento já foi decidido.");
  if (input.reason.trim().length < 3) throw new BusinessError("Informe o motivo da negativa.");
  await tx.warrantyClaim.update({ where: { id: c.id }, data: { status: "NEGADO", decisionNote: input.reason.trim(), decidedAt: new Date(), decidedById: userId } });
  await audit(tx, { userId, action: "warranty.deny", entity: "WarrantyClaim", entityId: c.id, summary: `Acionamento #${c.number} negado: ${input.reason}` });
}
