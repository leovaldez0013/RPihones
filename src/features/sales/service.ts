// Regras de venda (PDV): orçamento, conclusão com múltiplos pagamentos e troca, cancelamento/devolução.
import bcrypt from "bcryptjs";
import type { Tx } from "@/lib/db";
import { nextSequence } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { formatBRL, sum } from "@/domain/money";
import { DEVICE_STATUS, PAYMENT_METHOD, TRADE_IN_CHECKLIST } from "@/domain/constants";
import { calcCard, findFee, receivableSchedule } from "@/domain/installments";
import { calcCommission, saleTotals, type SaleLine } from "@/domain/sale";
import { BLOCKING_ITEMS } from "@/domain/trade-in";
import { addDeviceEvent, assertImeiAvailable, createDevice } from "@/features/devices/service";
import { moveAccessory } from "@/features/accessories/service";
import { createEntry, defaultAccountId, reverseEntries } from "@/features/finance/service";
import { onDeviceAvailable } from "@/features/orders/matching";
import { closeTasksFor, ensureTask } from "@/features/tasks/service";
import { generateSaleDocuments } from "@/features/documents/hooks";
import { getCardRules, getCommissionRates, getWarrantyDays } from "./config";
import type { SaleData } from "./schemas";

type Actor = { id: string; role: string };

type BuiltLine = SaleLine & {
  deviceId: string | null;
  accessoryId: string | null;
  description: string;
  warrantyDays: number;
};

const commercial = (cents: number) => Math.max(0, (Math.round(cents / 100 / 50) * 50 - 10) * 100);

async function releaseReservations(tx: Tx, saleId: string, userId: string) {
  const reserved = await tx.device.findMany({ where: { reservedForSaleId: saleId } });
  for (const d of reserved) {
    await tx.device.update({
      where: { id: d.id },
      data: { status: d.reservedForOrderId ? "RESERVADO" : "DISPONIVEL", reservedForSaleId: null, reservedCustomerId: d.reservedForOrderId ? d.reservedCustomerId : null },
    });
    await addDeviceEvent(tx, { deviceId: d.id, type: "RESERVA", description: "Reserva do orçamento liberada", userId, refType: "VENDA", refId: saleId });
  }
}

async function buildLines(tx: Tx, data: SaleData, saleId: string | undefined, completing: boolean): Promise<BuiltLine[]> {
  const warranty = await getWarrantyDays(tx);
  const seen = new Set<string>();
  const lines: BuiltLine[] = [];
  for (const it of data.items) {
    if (it.kind === "DEVICE") {
      if (!it.deviceId) throw new BusinessError("Aparelho inválido no carrinho.");
      if (seen.has(it.deviceId)) throw new BusinessError("O mesmo aparelho foi adicionado duas vezes.");
      seen.add(it.deviceId);
      const d = await tx.device.findUnique({ where: { id: it.deviceId }, include: { model: true } });
      if (!d || d.deletedAt) throw new BusinessError("Aparelho não encontrado no estoque.");
      const label = `${d.model.name} ${d.capacity} ${d.color}`;
      const reservedForMe =
        d.status === "RESERVADO" &&
        ((saleId && d.reservedForSaleId === saleId) ||
          (data.orderId && d.reservedForOrderId === data.orderId) ||
          (!d.reservedForSaleId && data.customerId && d.reservedCustomerId === data.customerId));
      if (d.status === "RESERVADO" && !reservedForMe) {
        throw new BusinessError(`${label} (IMEI ${d.imei}) está reservado para outro cliente. Libere a reserva antes de vender.`);
      }
      if (d.status !== "DISPONIVEL" && d.status !== "RESERVADO") {
        throw new BusinessError(`${label} (IMEI ${d.imei}) não está disponível: ${DEVICE_STATUS.label(d.status)}.`);
      }
      const otherActive = await tx.saleItem.findFirst({
        where: { deviceId: d.id, active: true, sale: { status: { in: ["CONCLUIDA", "ORCAMENTO"] }, id: saleId ? { not: saleId } : undefined } },
        include: { sale: true },
      });
      if (otherActive && (otherActive.sale.status === "CONCLUIDA" || completing)) {
        throw new BusinessError(`O IMEI ${d.imei} já está na venda #${otherActive.sale.number}.`);
      }
      if (it.discount > d.salePrice) throw new BusinessError(`Desconto maior que o preço de ${label}.`);
      lines.push({
        kind: "DEVICE",
        deviceId: d.id,
        accessoryId: null,
        description: `${label} — IMEI ${d.imei}`,
        quantity: 1,
        unitPrice: d.salePrice,
        discount: it.discount,
        unitCost: d.acquisitionCost + d.serviceCost,
        condition: d.condition,
        warrantyDays: warranty[d.condition]?.days ?? 90,
      });
    } else if (it.kind === "ACCESSORY") {
      if (!it.accessoryId) throw new BusinessError("Acessório inválido no carrinho.");
      const a = await tx.accessory.findUnique({ where: { id: it.accessoryId } });
      if (!a || a.deletedAt) throw new BusinessError("Acessório não encontrado.");
      if (completing && a.quantity < it.quantity) throw new BusinessError(`Estoque insuficiente de "${a.name}": disponível ${a.quantity}.`);
      if (it.discount > a.price * it.quantity) throw new BusinessError(`Desconto maior que o valor de ${a.name}.`);
      lines.push({
        kind: "ACCESSORY",
        deviceId: null,
        accessoryId: a.id,
        description: a.name,
        quantity: it.quantity,
        unitPrice: a.price,
        discount: it.discount,
        unitCost: a.cost,
        warrantyDays: warranty.ACESSORIO?.days ?? 90,
      });
    } else {
      if (!it.description || !it.unitPrice) throw new BusinessError("Serviço precisa de descrição e valor.");
      lines.push({
        kind: "SERVICE",
        deviceId: null,
        accessoryId: null,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discount: it.discount,
        unitCost: 0,
        warrantyDays: warranty.SERVICO?.days ?? 90,
      });
    }
  }
  return lines;
}

async function checkDiscount(tx: Tx, discountPct: number, actor: Actor, approval: SaleData["approval"]) {
  const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (discountPct <= me.discountLimitPct + 0.001) return null;
  if (!approval?.email || !approval.password) {
    throw new BusinessError(
      `Desconto de ${discountPct.toFixed(1).replace(".", ",")}% acima do seu limite (${me.discountLimitPct.toString().replace(".", ",")}%). É preciso a senha de um gerente.`,
      "DISCOUNT_APPROVAL",
    );
  }
  const mgr = await tx.user.findUnique({ where: { email: approval.email.trim().toLowerCase() } });
  if (!mgr || !mgr.active || mgr.deletedAt || !can(mgr.role, "sales.approveDiscount") || !(await bcrypt.compare(approval.password, mgr.passwordHash))) {
    throw new BusinessError("Credenciais de gerente inválidas para aprovar o desconto.", "DISCOUNT_APPROVAL");
  }
  if (discountPct > mgr.discountLimitPct + 0.001) {
    throw new BusinessError(`Desconto acima do limite também do aprovador (${mgr.discountLimitPct}%).`, "DISCOUNT_APPROVAL");
  }
  return mgr.id;
}

function validateTradeIns(data: SaleData) {
  const imeis = new Set<string>();
  for (const t of data.tradeIns) {
    const blocked = Object.entries(t.checklist).filter(([k, ok]) => ok === false && BLOCKING_ITEMS.includes(k));
    if (blocked.length) {
      const label = TRADE_IN_CHECKLIST.find((c) => c.key === blocked[0][0])?.label ?? blocked[0][0];
      throw new BusinessError(`Aparelho de troca recusado: "${label}" não passou no checklist.`);
    }
    if (imeis.has(t.imei)) throw new BusinessError("IMEI repetido entre os aparelhos de troca.");
    imeis.add(t.imei);
  }
}

/** Salva orçamento ou conclui a venda. */
export async function saveSale(tx: Tx, data: SaleData, actor: Actor) {
  const completing = data.action === "CONCLUIR";
  let existing: Awaited<ReturnType<typeof tx.sale.findUnique>> = null;
  if (data.id) {
    existing = await tx.sale.findUnique({ where: { id: data.id } });
    if (!existing || existing.deletedAt) throw new BusinessError("Venda não encontrada.");
    if (existing.status !== "ORCAMENTO") throw new BusinessError("Só orçamentos podem ser alterados.");
  }
  const sellerId = data.sellerId && can(actor.role, "sales.viewAll") ? data.sellerId : (existing?.sellerId ?? actor.id);

  const lines = await buildLines(tx, data, existing?.id, completing);
  const totals = saleTotals(lines, data.discount);
  if (totals.total < 0) throw new BusinessError("O desconto é maior que o valor da venda.");
  const approvedById = await checkDiscount(tx, totals.discountPct, actor, data.approval);

  validateTradeIns(data);
  for (const t of data.tradeIns) {
    if (lines.some((l) => l.description.includes(t.imei))) throw new BusinessError("O aparelho de troca não pode ser o mesmo que está sendo vendido.");
    if (completing) await assertImeiAvailable(tx, t.imei, t.imei2);
  }
  const tradeTotal = sum(data.tradeIns.map((t) => t.finalValue));
  if (completing && data.tradeIns.length && !data.customerId) throw new BusinessError("Venda com troca precisa de cliente identificado (termo de procedência).");

  // pagamentos: TROCA vem das avaliações; demais do formulário
  const payments = data.payments.filter((p) => p.method !== "TROCA");
  const paid = sum(payments.map((p) => p.amount)) + tradeTotal;
  if (completing && paid !== totals.total) {
    throw new BusinessError(
      paid < totals.total ? `Falta receber ${formatBRL(totals.total - paid)}.` : `Pagamentos excedem o total em ${formatBRL(paid - totals.total)}.`,
    );
  }
  if (completing && tradeTotal > totals.total) throw new BusinessError("O valor da troca é maior que o total da venda.");

  // encomenda: o sinal já pago abate do total
  const sinal = sum(payments.filter((p) => p.method === "SINAL").map((p) => p.amount));
  if (sinal > 0 && !data.orderId) throw new BusinessError("Pagamento com sinal só é possível a partir de uma encomenda.");
  if (data.orderId) {
    const order = await tx.order.findUnique({ where: { id: data.orderId } });
    if (!order || order.deletedAt) throw new BusinessError("Encomenda não encontrada.");
    if (["ENTREGUE", "CANCELADA"].includes(order.status)) throw new BusinessError(`A encomenda #${order.number} já foi finalizada.`);
    if (data.customerId && order.customerId !== data.customerId) throw new BusinessError("A encomenda é de outro cliente.");
    if (sinal > order.deposit) throw new BusinessError(`O sinal da encomenda é de ${formatBRL(order.deposit)}.`);
  }

  // ── grava a venda ──
  if (existing) {
    await releaseReservations(tx, existing.id, actor.id);
    await tx.saleItem.deleteMany({ where: { saleId: existing.id } });
    await tx.tradeIn.deleteMany({ where: { saleId: existing.id, deviceId: null } });
  }
  const now = new Date();
  const base = {
    status: completing ? "CONCLUIDA" : "ORCAMENTO",
    customerId: data.customerId ?? null,
    sellerId,
    approvedById,
    subtotal: totals.subtotal,
    itemDiscount: totals.itemDiscount,
    discount: totals.discount,
    total: totals.total,
    cost: totals.cost,
    notes: data.notes,
    orderId: data.orderId ?? null,
    validUntil: completing ? null : (data.validUntil ?? new Date(now.getTime() + 7 * 86400000)),
    completedAt: completing ? now : null,
  };
  const sale = existing
    ? await tx.sale.update({ where: { id: existing.id }, data: base })
    : await tx.sale.create({ data: { ...base, number: await nextSequence(tx, "SALE") } });

  for (const l of lines) {
    await tx.saleItem.create({
      data: {
        saleId: sale.id,
        kind: l.kind,
        deviceId: l.deviceId,
        accessoryId: l.accessoryId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        unitCost: l.unitCost,
        warrantyDays: l.warrantyDays,
      },
    });
  }

  if (!completing) {
    for (const l of lines.filter((x) => x.deviceId)) {
      await tx.device.update({ where: { id: l.deviceId! }, data: { status: "RESERVADO", reservedForSaleId: sale.id, reservedCustomerId: data.customerId ?? null } });
      await addDeviceEvent(tx, { deviceId: l.deviceId!, type: "RESERVA", description: `Reservado no orçamento #${sale.number}`, userId: actor.id, refType: "VENDA", refId: sale.id });
    }
    for (const t of data.tradeIns) {
      await tx.tradeIn.create({
        data: {
          saleId: sale.id,
          customerId: data.customerId ?? null,
          imei: t.imei,
          imei2: t.imei2,
          serial: t.serial,
          modelId: t.modelId,
          capacity: t.capacity,
          color: t.color,
          batteryHealth: t.batteryHealth,
          grade: t.grade || null,
          checklist: JSON.stringify(t.checklist),
          photos: JSON.stringify(t.photos),
          notes: t.notes,
          suggestedValue: t.suggestedValue,
          finalValue: t.finalValue,
        },
      });
    }
    await audit(tx, { userId: actor.id, action: "sale.quote", entity: "Sale", entityId: sale.id, summary: `Orçamento #${sale.number}: ${formatBRL(totals.total)}` });
    return sale;
  }

  await completeSale(tx, sale.id, sale.number, lines, data, totals.total, actor, sellerId);
  return tx.sale.findUniqueOrThrow({ where: { id: sale.id } });
}

async function completeSale(
  tx: Tx,
  saleId: string,
  saleNumber: number,
  lines: BuiltLine[],
  data: SaleData,
  total: number,
  actor: Actor,
  sellerId: string,
) {
  const [settings, customer] = await Promise.all([
    tx.storeSettings.findUnique({ where: { id: "default" } }),
    data.customerId ? tx.customer.findUnique({ where: { id: data.customerId } }) : null,
  ]);
  const who = customer?.name ?? "Consumidor";

  // estoque
  for (const l of lines) {
    if (l.deviceId) {
      await tx.device.update({ where: { id: l.deviceId }, data: { status: "VENDIDO", reservedForSaleId: null, reservedForOrderId: null, reservedCustomerId: null } });
      await addDeviceEvent(tx, {
        deviceId: l.deviceId,
        type: "VENDA",
        description: `Vendido na venda #${saleNumber} para ${who} por ${formatBRL(l.unitPrice - l.discount)}`,
        userId: actor.id,
        refType: "VENDA",
        refId: saleId,
      });
    } else if (l.accessoryId) {
      await moveAccessory(tx, { accessoryId: l.accessoryId, type: "SAIDA", delta: -l.quantity, reason: `Venda #${saleNumber}`, refType: "VENDA", refId: saleId, userId: actor.id });
    }
  }

  // aparelhos de troca → estoque
  const tradeStatus = (settings?.tradeInDefaultStatus ?? "EM_AVALIACAO") as "EM_AVALIACAO" | "DISPONIVEL";
  const tradeKeyToId: Record<string, string> = {};
  for (const t of data.tradeIns) {
    const device = await createDevice(
      tx,
      {
        imei: t.imei,
        imei2: t.imei2 ?? null,
        serial: t.serial ?? null,
        modelId: t.modelId,
        capacity: t.capacity,
        color: t.color,
        condition: "SEMINOVO",
        batteryHealth: t.batteryHealth ?? null,
        grade: (t.grade || null) as "A" | null,
        notes: t.notes ?? null,
        photos: t.photos,
        supplierId: null,
        acquisitionCost: t.finalValue,
        salePrice: commercial(Math.round(t.finalValue * 1.35)),
        entryDate: new Date(),
        appleWarrantyUntil: null,
        status: tradeStatus,
      },
      { userId: actor.id, origin: "TROCA", eventType: "TROCA", refType: "VENDA", refId: saleId, eventDescription: `Recebido na troca da venda #${saleNumber} — ${who} — avaliado em ${formatBRL(t.finalValue)}` },
    );
    const ti = await tx.tradeIn.create({
      data: {
        saleId,
        customerId: data.customerId ?? null,
        imei: t.imei,
        imei2: t.imei2,
        serial: t.serial,
        modelId: t.modelId,
        capacity: t.capacity,
        color: t.color,
        batteryHealth: t.batteryHealth,
        grade: t.grade || null,
        checklist: JSON.stringify(t.checklist),
        photos: JSON.stringify(t.photos),
        notes: t.notes,
        suggestedValue: t.suggestedValue,
        finalValue: t.finalValue,
        deviceId: device.id,
      },
    });
    tradeKeyToId[t.key] = ti.id;
    if (tradeStatus === "DISPONIVEL") await onDeviceAvailable(tx, device.id);
  }

  // pagamentos e financeiro
  const cardRules = await getCardRules(tx);
  const cashSession = await tx.cashSession.findFirst({ where: { userId: actor.id, closedAt: null }, orderBy: { openedAt: "desc" } });
  const revenueKey = lines.some((l) => l.kind === "DEVICE") ? "VENDA_APARELHO" : lines.some((l) => l.kind === "SERVICE") ? "SERVICO" : "VENDA_ACESSORIO";
  let interestTotal = 0;
  let feesTotal = 0;
  const now = new Date();
  const desc = (m: string) => `Venda #${saleNumber} — ${who} (${PAYMENT_METHOD.label(m)})`;

  for (const t of data.tradeIns) {
    await tx.salePayment.create({ data: { saleId, method: "TROCA", amount: t.finalValue, tradeInId: tradeKeyToId[t.key] } });
  }

  for (const p of data.payments.filter((x) => x.method !== "TROCA")) {
    const common = { originType: "VENDA", originId: saleId, customerId: data.customerId ?? null, categoryKey: revenueKey, userId: actor.id };
    if (p.method === "DEBITO" || p.method === "CREDITO" || p.method === "CREDITO_PARCELADO") {
      const n = p.method === "CREDITO_PARCELADO" ? Math.max(2, p.installments) : 1;
      const rule = findFee(cardRules, p.method === "DEBITO" ? "DEBITO" : "CREDITO", n) ?? { feePct: 0, customerRatePct: 0, settlementDays: p.method === "DEBITO" ? 1 : 30 };
      const calc = calcCard(p.amount, rule, n);
      const accountId = p.accountId ?? cardRules[0]?.accountId ?? (await defaultAccountId(tx, "MAQUININHA"));
      await tx.salePayment.create({
        data: { saleId, method: p.method, amount: p.amount, installments: n, interest: calc.interest, feePct: calc.feePct, feeAmount: calc.feeAmount, brand: p.brand ?? null, accountId },
      });
      interestTotal += calc.interest;
      feesTotal += calc.feeAmount;
      for (const r of receivableSchedule(calc, rule.settlementDays, now)) {
        await createEntry(tx, {
          ...common,
          type: "RECEBER",
          description: n > 1 ? `${desc(p.method)} ${r.installment}/${n}` : desc(p.method),
          amount: r.gross,
          netAmount: r.net,
          dueDate: r.dueDate,
          accountId,
          method: p.method,
          installment: n > 1 ? r.installment : undefined,
          installments: n > 1 ? n : undefined,
        });
      }
    } else if (p.method === "BOLETO" || p.method === "CREDIARIO") {
      const n = p.method === "CREDIARIO" ? p.installments : 1;
      const parts = Array.from({ length: n }, (_, i) => Math.floor(p.amount / n) + (i === 0 ? p.amount % n : 0));
      const first = p.firstDueDate ?? new Date(now.getTime() + (p.method === "BOLETO" ? 3 : 30) * 86400000);
      const accountId = p.accountId ?? (await defaultAccountId(tx, "BANCO"));
      await tx.salePayment.create({ data: { saleId, method: p.method, amount: p.amount, installments: n, accountId } });
      for (let i = 0; i < n; i++) {
        const due = new Date(first);
        due.setMonth(due.getMonth() + i);
        await createEntry(tx, {
          ...common,
          type: "RECEBER",
          description: n > 1 ? `${desc(p.method)} ${i + 1}/${n}` : desc(p.method),
          amount: parts[i],
          dueDate: due,
          accountId,
          method: p.method,
          installment: n > 1 ? i + 1 : undefined,
          installments: n > 1 ? n : undefined,
        });
      }
    } else if (p.method === "SINAL") {
      // sinal de encomenda já entrou no financeiro quando foi recebido
      await tx.salePayment.create({ data: { saleId, method: "SINAL", amount: p.amount } });
    } else {
      // DINHEIRO e PIX: recebido na hora
      const accountId = p.accountId ?? (await defaultAccountId(tx, p.method === "DINHEIRO" ? "CAIXA" : "BANCO"));
      await tx.salePayment.create({ data: { saleId, method: p.method, amount: p.amount, accountId } });
      await createEntry(tx, {
        ...common,
        type: "RECEBER",
        description: desc(p.method),
        amount: p.amount,
        dueDate: now,
        paid: true,
        paidAt: now,
        accountId,
        method: p.method,
        cashSessionId: p.method === "DINHEIRO" ? (cashSession?.id ?? null) : null,
      });
    }
  }

  const { rates, fallbackPct } = await getCommissionRates(tx, sellerId);
  const commission = calcCommission(lines, data.discount, rates, fallbackPct);
  await tx.sale.update({ where: { id: saleId }, data: { interest: interestTotal, cardFees: feesTotal, commission } });

  if (customer) {
    const due = new Date(now);
    due.setDate(due.getDate() + (settings?.postSaleDays ?? 7));
    const model = lines.find((l) => l.kind === "DEVICE")?.description.split(" — ")[0];
    await ensureTask(tx, {
      key: `POS_VENDA:${saleId}`,
      type: "POS_VENDA",
      title: `Pós-venda: perguntar a ${customer.name.split(" ")[0]} como está ${model ? `o ${model}` : "a compra"}`,
      dueDate: due,
      customerId: customer.id,
      userId: sellerId,
      refType: "VENDA",
      refId: saleId,
    });
  }

  if (data.orderId) {
    await tx.order.update({ where: { id: data.orderId }, data: { status: "ENTREGUE" } });
    await audit(tx, { userId: actor.id, action: "order.deliver", entity: "Order", entityId: data.orderId, summary: `Encomenda entregue na venda #${saleNumber}` });
  }

  await generateSaleDocuments(tx, saleId, actor.id);
  await audit(tx, {
    userId: actor.id,
    action: "sale.complete",
    entity: "Sale",
    entityId: saleId,
    summary: `Venda #${saleNumber} concluída: ${formatBRL(total)} — ${who}`,
  });
}

/** Cancela orçamento ou cancela/devolve venda concluída (estoque volta e financeiro é estornado). */
export async function cancelSale(tx: Tx, input: { id: string; type: "CANCELAMENTO" | "DEVOLUCAO"; reason: string }, actor: Actor) {
  const sale = await tx.sale.findUnique({ where: { id: input.id }, include: { items: true, tradeIns: { include: { device: true } }, customer: true } });
  if (!sale || sale.deletedAt) throw new BusinessError("Venda não encontrada.");
  const now = new Date();

  if (sale.status === "ORCAMENTO") {
    await releaseReservations(tx, sale.id, actor.id);
    await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELADA", canceledAt: now, cancelReason: input.reason } });
    await audit(tx, { userId: actor.id, action: "sale.quote_cancel", entity: "Sale", entityId: sale.id, summary: `Orçamento #${sale.number} cancelado: ${input.reason}` });
    return;
  }
  if (sale.status !== "CONCLUIDA") throw new BusinessError("Esta venda já foi cancelada ou devolvida.");

  const label = input.type === "DEVOLUCAO" ? "Devolução" : "Cancelamento";
  for (const it of sale.items.filter((i) => i.active)) {
    if (it.deviceId) {
      await tx.device.update({ where: { id: it.deviceId }, data: { status: "DISPONIVEL" } });
      await addDeviceEvent(tx, { deviceId: it.deviceId, type: "DEVOLUCAO", description: `${label} da venda #${sale.number}: ${input.reason}`, userId: actor.id, refType: "VENDA", refId: sale.id });
      await onDeviceAvailable(tx, it.deviceId);
    } else if (it.accessoryId) {
      await moveAccessory(tx, { accessoryId: it.accessoryId, type: "ENTRADA", delta: it.quantity, reason: `${label} da venda #${sale.number}`, refType: "VENDA", refId: sale.id, userId: actor.id });
    }
  }
  await tx.saleItem.updateMany({ where: { saleId: sale.id }, data: { active: false } });

  await reverseEntries(tx, "VENDA", sale.id, { reason: `${label} da venda #${sale.number}: ${input.reason}`, userId: actor.id, date: now });

  // aparelhos recebidos na troca: devolvidos ao cliente, ou reembolsados se já foram vendidos
  for (const t of sale.tradeIns) {
    if (!t.device) continue;
    if (t.device.status === "VENDIDO" || t.device.status === "RESERVADO") {
      await createEntry(tx, {
        type: "PAGAR",
        description: `Reembolso do aparelho de troca — venda #${sale.number}`,
        amount: t.finalValue,
        dueDate: now,
        paid: true,
        categoryKey: "ESTORNO",
        accountId: await defaultAccountId(tx, "CAIXA"),
        method: "DINHEIRO",
        customerId: sale.customerId,
        originType: "ESTORNO",
        originId: sale.id,
        notes: "Aparelho de troca já havia sido vendido; valor devolvido ao cliente.",
        userId: actor.id,
      });
    } else {
      await tx.device.update({ where: { id: t.device.id }, data: { status: "DEVOLVIDO" } });
      await addDeviceEvent(tx, { deviceId: t.device.id, type: "DEVOLUCAO", description: `Devolvido ao cliente (${label.toLowerCase()} da venda #${sale.number})`, userId: actor.id, refType: "VENDA", refId: sale.id });
    }
  }

  await tx.sale.update({
    where: { id: sale.id },
    data: { status: input.type === "DEVOLUCAO" ? "DEVOLVIDA" : "CANCELADA", canceledAt: now, cancelReason: input.reason, commission: 0 },
  });
  await closeTasksFor(tx, "VENDA", sale.id);
  await audit(tx, {
    userId: actor.id,
    action: input.type === "DEVOLUCAO" ? "sale.return" : "sale.cancel",
    entity: "Sale",
    entityId: sale.id,
    summary: `${label} da venda #${sale.number} (${formatBRL(sale.total)}): ${input.reason}`,
  });
}
