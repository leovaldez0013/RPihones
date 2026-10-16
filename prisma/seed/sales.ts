// Vendas históricas geradas pelo próprio serviço de vendas (mesmas regras do PDV)
// e depois "movidas" para a data desejada, para o seed ter 6 meses coerentes.
import { db } from "../../src/lib/db";
import { saveSale, cancelSale } from "../../src/features/sales/service";
import { saleSchema } from "../../src/features/sales/schemas";
import { TRADE_IN_CHECKLIST } from "../../src/domain/constants";
import { evaluateTradeIn } from "../../src/domain/trade-in";
import { makeImei } from "../../src/domain/imei";
import { BASE_PRICE } from "./stock";
import { addDays, chance, int, pick, rand } from "./util";

const DAY = 86400000;

/** Desloca todos os registros gerados por uma venda feita "agora" para a data `when`. */
async function moveSaleTo(saleId: string, when: Date) {
  const sale = await db.sale.findUniqueOrThrow({ where: { id: saleId }, include: { tradeIns: true, items: true } });
  const offset = when.getTime() - (sale.completedAt ?? sale.createdAt).getTime();
  const shift = (d: Date | null) => (d ? new Date(d.getTime() + offset) : null);
  const today = new Date();

  await db.sale.update({ where: { id: saleId }, data: { createdAt: shift(sale.createdAt)!, completedAt: shift(sale.completedAt), validUntil: shift(sale.validUntil) } });

  const entries = await db.financialEntry.findMany({ where: { originType: "VENDA", originId: saleId } });
  for (const e of entries) {
    const due = shift(e.dueDate)!;
    // recebíveis de cartão/boleto já vencidos foram liquidados
    const settled = e.status === "ABERTA" && due < today && e.method !== "CREDIARIO" ? true : e.status === "PAGA";
    await db.financialEntry.update({
      where: { id: e.id },
      data: { dueDate: due, createdAt: shift(e.createdAt)!, status: settled ? "PAGA" : e.status, paidAt: settled ? (e.paidAt ? shift(e.paidAt) : due) : null },
    });
  }
  const deviceIds = [...sale.items.map((i) => i.deviceId), ...sale.tradeIns.map((t) => t.deviceId)].filter(Boolean) as string[];
  const events = await db.deviceEvent.findMany({ where: { refType: "VENDA", refId: saleId } });
  for (const ev of events) await db.deviceEvent.update({ where: { id: ev.id }, data: { createdAt: shift(ev.createdAt)! } });
  for (const t of sale.tradeIns) {
    if (t.deviceId) await db.device.update({ where: { id: t.deviceId }, data: { entryDate: when, createdAt: when } });
    await db.tradeIn.update({ where: { id: t.id }, data: { createdAt: when } });
  }
  void deviceIds;
  const moves = await db.stockMovement.findMany({ where: { refType: "VENDA", refId: saleId } });
  for (const m of moves) await db.stockMovement.update({ where: { id: m.id }, data: { createdAt: shift(m.createdAt)! } });
  const tasks = await db.task.findMany({ where: { refType: "VENDA", refId: saleId } });
  for (const t of tasks) {
    const due = shift(t.dueDate)!;
    await db.task.update({ where: { id: t.id }, data: { dueDate: due, createdAt: when, doneAt: due < addDays(today, -1) ? due : null } });
  }
  await db.document.updateMany({ where: { saleId }, data: { createdAt: when } });
  const logs = await db.auditLog.findMany({ where: { entity: "Sale", entityId: saleId } });
  for (const l of logs) await db.auditLog.update({ where: { id: l.id }, data: { createdAt: shift(l.createdAt)! } });
}

const allOk = () => Object.fromEntries(TRADE_IN_CHECKLIST.map((c) => [c.key, true]));

export async function seedTradeInTable() {
  const models = await db.deviceModel.findMany();
  for (const m of models) {
    const caps: string[] = JSON.parse(m.capacities);
    for (const [i, cap] of caps.entries()) {
      const base = Math.round(((BASE_PRICE[m.name] ?? 3000) * (1 + i * 0.12) * 0.6) / 50) * 50 * 100;
      await db.tradeInPrice.upsert({
        where: { modelId_capacity_condition: { modelId: m.id, capacity: cap, condition: "SEMINOVO" } },
        create: { modelId: m.id, capacity: cap, condition: "SEMINOVO", baseValue: base },
        update: {},
      });
    }
  }
  await db.commissionRule.createMany({
    data: [
      { userId: null, category: "APARELHO_NOVO", pct: 1 },
      { userId: null, category: "APARELHO_SEMINOVO", pct: 2 },
      { userId: null, category: "ACESSORIO", pct: 8 },
      { userId: null, category: "SERVICO", pct: 5 },
    ],
  });
}

export async function seedSalesHistory(users: { gerente: string; vendedor1: string; vendedor2: string }, customerIds: string[], maquininhaId: string) {
  const today = new Date();
  const devices = await db.device.findMany({ where: { status: "DISPONIVEL", origin: "COMPRA" }, orderBy: { entryDate: "asc" }, include: { model: true } });
  const accessories = await db.accessory.findMany({ where: { isPart: false } });
  const models = await db.deviceModel.findMany();
  const tradePrices = await db.tradeInPrice.findMany();
  const sellers = [users.vendedor1, users.vendedor1, users.vendedor2, users.vendedor2, users.gerente];
  let tradeSerial = 500000;
  let count = 0;
  let trades = 0;

  // vende ~65% dos aparelhos, de 1 a 75 dias após a entrada
  const toSell = devices.filter(() => chance(0.65));
  const plan = toSell
    .map((d) => ({ d, when: new Date(d.entryDate.getTime() + int(1, 75) * DAY + int(0, 8) * 3600000) }))
    .filter((p) => p.when < addDays(today, -0.2))
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  for (const { d, when } of plan) {
    const sellerId = pick(sellers);
    const actor = { id: sellerId, role: sellerId === users.gerente ? "GERENTE" : "VENDEDOR" };
    const customerId = chance(0.88) ? pick(customerIds) : null;
    const items: { kind: "DEVICE" | "ACCESSORY"; deviceId?: string; accessoryId?: string; quantity?: number; discount?: number }[] = [
      { kind: "DEVICE", deviceId: d.id, discount: chance(0.3) ? Math.min(Math.round((d.salePrice * int(1, 4)) / 100 / 1000) * 1000, Math.floor(d.salePrice * 0.04)) : 0 },
    ];
    if (chance(0.55)) {
      const compat = accessories.filter((a) => a.quantity > 2 && (a.compatibility.includes(d.model.name) || a.compatibility === "[]"));
      const a = compat.length ? pick(compat) : null;
      if (a) items.push({ kind: "ACCESSORY", accessoryId: a.id, quantity: 1 });
      if (chance(0.4)) {
        const pel = accessories.find((x) => x.category === "PELICULA" && x.quantity > 2 && x.compatibility.includes(d.model.family));
        if (pel && pel.id !== a?.id) items.push({ kind: "ACCESSORY", accessoryId: pel.id, quantity: 1 });
      }
    }
    const total =
      d.salePrice -
      (items[0].discount ?? 0) +
      items.slice(1).reduce((s, it) => s + (accessories.find((a) => a.id === it.accessoryId)?.price ?? 0), 0);

    // troca em ~28% das vendas identificadas
    const tradeIns: Record<string, unknown>[] = [];
    let remaining = total;
    if (customerId && chance(0.28)) {
      const older = models.filter((m) => m.year < (d.model.year ?? 2025) && m.year >= 2019);
      if (older.length) {
        const tm = pick(older);
        const caps: string[] = JSON.parse(tm.capacities);
        const cap = pick(caps.slice(0, 2));
        const price = tradePrices.find((p) => p.modelId === tm.id && p.capacity === cap);
        const battery = int(78, 96);
        const grade = pick(["A", "A", "B", "B", "C"]);
        const checklist = allOk();
        if (chance(0.15)) checklist.tela = false;
        const ev = evaluateTradeIn(price?.baseValue ?? 100000, { batteryHealth: battery, grade, checklist });
        const value = Math.min(ev.suggested, Math.floor(total * 0.7));
        if (value > 20000) {
          tradeIns.push({
            key: "t1",
            imei: makeImei("35987654", tradeSerial++),
            modelId: tm.id,
            capacity: cap,
            color: pick(JSON.parse(tm.colors) as string[]),
            batteryHealth: battery,
            grade,
            checklist,
            suggestedValue: ev.suggested,
            finalValue: value,
          });
          remaining -= value;
          trades++;
        }
      }
    }

    const payments: Record<string, unknown>[] = [];
    const r = rand();
    if (r < 0.35) payments.push({ method: "PIX", amount: remaining });
    else if (r < 0.65) payments.push({ method: "CREDITO_PARCELADO", amount: remaining, installments: pick([2, 3, 4, 6, 10, 10, 12]), accountId: maquininhaId });
    else if (r < 0.75) payments.push({ method: "CREDITO", amount: remaining, accountId: maquininhaId });
    else if (r < 0.83) payments.push({ method: "DEBITO", amount: remaining, accountId: maquininhaId });
    else if (r < 0.92) {
      const cash = Math.min(remaining, Math.round((remaining * int(20, 60)) / 100 / 10000) * 10000);
      if (cash > 0) payments.push({ method: "DINHEIRO", amount: cash });
      if (remaining - cash > 0) payments.push({ method: "PIX", amount: remaining - cash });
    } else if (customerId) payments.push({ method: "CREDIARIO", amount: remaining, installments: pick([3, 4, 5]) });
    else payments.push({ method: "DINHEIRO", amount: remaining });

    try {
      const sale = await db.$transaction(
        (tx) => saveSale(tx, saleSchema.parse({ action: "CONCLUIR", customerId, items, tradeIns, payments }), actor),
        { timeout: 20000 },
      );
      await moveSaleTo(sale.id, when);
      for (const it of items.filter((i) => i.accessoryId)) {
        const a = accessories.find((x) => x.id === it.accessoryId);
        if (a) a.quantity -= it.quantity ?? 1;
      }
      count++;
      // ~3% devolvidas alguns dias depois
      if (chance(0.03) && when < addDays(today, -5)) {
        await db.$transaction((tx) => cancelSale(tx, { id: sale.id, type: "DEVOLUCAO", reason: "Cliente desistiu dentro do prazo de 7 dias" }, { id: users.gerente, role: "GERENTE" }));
        await db.sale.update({ where: { id: sale.id }, data: { canceledAt: addDays(when, int(1, 5)) } });
      }
    } catch (e) {
      console.warn(`  venda ignorada: ${(e as Error).message}`);
    }
  }

  // alguns orçamentos em aberto
  const available = await db.device.findMany({ where: { status: "DISPONIVEL" }, take: 3, orderBy: { salePrice: "desc" } });
  for (const d of available) {
    await db.$transaction((tx) =>
      saveSale(tx, saleSchema.parse({ action: "ORCAMENTO", customerId: pick(customerIds), items: [{ kind: "DEVICE", deviceId: d.id }] }), { id: users.vendedor1, role: "VENDEDOR" }),
    );
  }
  return { count, trades };
}
