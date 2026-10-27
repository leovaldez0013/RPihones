// Modo simulação: 1 mês de operação fictícia separada dos dados reais — num arquivo à parte no SQLite
// (prisma/simulacao.db) ou no schema "simulacao" do PostgreSQL.
// O banco real nunca é tocado: a simulação começa como cópia das configurações (usuários, loja,
// catálogo, taxas, acessórios, TACs reais) e todo o resto é gerado nela usando os MESMOS serviços
// do app (vendas, OS, encomendas, garantias), depois "movidos" para as datas do mês.
import fs from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { SIM_DB_FILE, SIM_SCHEMA, closeSimClient, realDb, realDbFile, setSimulationMode, simClient, simulationActive, simulationBackend, simulationSupported } from "@/lib/db";
import { makeImei } from "@/domain/imei";
import { priceFor } from "@/domain/pricing";
import { TRADE_IN_CHECKLIST } from "@/domain/constants";
import { deviceSchema } from "@/features/devices/schemas";
import { createDevice } from "@/features/devices/service";
import { cancelSale, saveSale } from "@/features/sales/service";
import { saleSchema } from "@/features/sales/schemas";
import { soCreateSchema } from "@/features/service-orders/schemas";
import { addPart, cancelServiceOrder, createServiceOrder, deliverServiceOrder, moveServiceOrder } from "@/features/service-orders/service";
import { orderSchema } from "@/features/orders/schemas";
import { cancelOrder, deliverOrder, registerArrival, saveOrder, setOrderStatus } from "@/features/orders/service";
import { approveClaim, claimWarranty, denyClaim } from "@/features/warranty/service";
import { getWarrantyDays } from "@/features/sales/config";

const DAY = 86400000;

export type SimulationCase = { key: "LUHN" | "DUPLICADO" | "TAC"; title: string; imei: string; detail: string; result: string; ok: boolean };
export type SimulationMeta = {
  generatedAt: string;
  generatedBy: string;
  days: number;
  devices: number;
  withoutImei: number;
  sales: number;
  tradeIns: number;
  canceledSales: number;
  serviceOrders: number;
  orders: number;
  claims: number;
  customers: number;
  tacs: number;
  skipped: string[];
  cases: SimulationCase[];
};

/** A simulação existe (arquivo no SQLite, schema no PostgreSQL)? */
export async function simulationExists() {
  if (simulationBackend() === "sqlite") return fs.existsSync(SIM_DB_FILE);
  const rows = await realDb.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM information_schema.schemata WHERE schema_name = '${SIM_SCHEMA}'`);
  return rows.length > 0;
}

/** Resumo da simulação e relatório do "Teste do app" ficam no banco real (SimulationState). */
async function saveState(data: { meta?: SimulationMeta | null; report?: string | null }) {
  const values = { ...("meta" in data ? { meta: data.meta ? JSON.stringify(data.meta) : null } : {}), ...("report" in data ? { report: data.report } : {}) };
  await realDb.simulationState.upsert({ where: { id: "default" }, create: values, update: values });
}

export async function simulationStatus() {
  const exists = simulationSupported() && (await simulationExists());
  const state = exists ? await realDb.simulationState.findUnique({ where: { id: "default" } }) : null;
  const meta = state?.meta ? (JSON.parse(state.meta) as SimulationMeta) : null;
  return { supported: simulationSupported(), exists, active: exists && (await simulationActive()), meta };
}

export async function saveTestReport(report: unknown) {
  await saveState({ report: JSON.stringify(report) });
}

export async function loadTestReport<T>(): Promise<T | null> {
  const state = await realDb.simulationState.findUnique({ where: { id: "default" } });
  return state?.report ? (JSON.parse(state.report) as T) : null;
}

/** Gerador pseudoaleatório (mulberry32): cada simulação nova é diferente, mas estável durante a geração. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)];
  const weighted = <T,>(items: { item: T; w: number }[]) => {
    const total = items.reduce((s, i) => s + i.w, 0);
    let r = next() * total;
    for (const i of items) if ((r -= i.w) <= 0) return i.item;
    return items[items.length - 1].item;
  };
  return { next, int, pick, weighted, chance: (p: number) => next() < p };
}

/** Tabelas operacionais apagadas na cópia (ficam só configurações). */
const OPERATIONAL = [
  "AuditLog", "Notification", "DeviceEvent", "ImeiCheck", "StockMovement", "WarrantyClaim", "Warranty", "SaleItem", "SalePayment", "TradeIn", "Sale",
  "ServiceOrderPart", "ServiceOrder", "Document", "PurchaseItem", "PurchaseOrder", "UsedDevicePurchase", "Order",
  "CashMovement", "CashSession", "FinancialEntry", "Task", "CampaignSend", "Device", "Customer", "Supplier", "Sequence",
];

/** Remove a simulação (arquivo ou schema) sem tocar no banco real. */
async function dropSimulation() {
  await setSimulationMode(false);
  await closeSimClient();
  if (simulationBackend() === "sqlite") {
    for (const f of [SIM_DB_FILE, `${SIM_DB_FILE}-journal`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  } else {
    await realDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SIM_SCHEMA}" CASCADE`);
  }
  await saveState({ meta: null });
}

async function freshCopy(): Promise<PrismaClient> {
  await dropSimulation();
  if (simulationBackend() === "sqlite") {
    if (!fs.existsSync(realDbFile())) throw new BusinessError("Banco real não encontrado.");
    // cópia consistente do banco real (configurações incluídas); o original só é lido
    await realDb.$executeRawUnsafe(`VACUUM INTO '${SIM_DB_FILE.replace(/'/g, "''")}'`);
    const sim = simClient();
    await sim.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    for (const t of OPERATIONAL) await sim.$executeRawUnsafe(`DELETE FROM "${t}"`);
    await sim.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    await sim.financialAccount.updateMany({ data: { initialBalance: 0 } });
    return sim;
  }
  // PostgreSQL: schema "simulacao" com a mesma estrutura das tabelas reais (colunas, padrões, índices e
  // chaves únicas) e só as configurações copiadas; o schema real só é lido
  const tables = await realDb.$queryRawUnsafe<{ name: string }[]>(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE '\\_prisma%'`,
  );
  await realDb.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${SIM_SCHEMA}"`);
      for (const { name } of tables) {
        await tx.$executeRawUnsafe(`CREATE TABLE "${SIM_SCHEMA}"."${name}" (LIKE public."${name}" INCLUDING ALL)`);
        if (!OPERATIONAL.includes(name) && name !== "SimulationState") await tx.$executeRawUnsafe(`INSERT INTO "${SIM_SCHEMA}"."${name}" SELECT * FROM public."${name}"`);
      }
    },
    { timeout: 60000 },
  );
  const sim = simClient();
  await sim.financialAccount.updateMany({ data: { initialBalance: 0 } });
  return sim;
}

const FIRST = ["Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Marcos", "Natália", "Otávio", "Patrícia", "Rafael", "Sabrina", "Thiago", "Vanessa", "Beatriz", "Caio", "Daniela", "Enzo", "Fernanda", "Gustavo", "Helena", "Júlia", "Leonardo", "Mariana", "Pedro"];
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Rocha", "Dias"];

const REPAIRS = [
  { problem: "Tela trincada após queda, touch falhando", services: "Troca de tela", part: /Tela/i, price: [45000, 120000] },
  { problem: "Bateria descarregando rápido, saúde baixa", services: "Troca de bateria", part: /Bateria/i, price: [25000, 45000] },
  { problem: "Não carrega, conector com mau contato", services: "Troca do conector de carga", part: /Conector/i, price: [18000, 30000] },
  { problem: "Câmera traseira sem foco / tremendo", services: "Troca do módulo da câmera", part: null, price: [35000, 65000] },
  { problem: "Travando e reiniciando sozinho", services: "Restauração e atualização do sistema", part: null, price: [12000, 20000] },
] as const;

// ── deslocamento de datas: o que um serviço fez "agora" passa para a data simulada ──

async function moveSaleTo(sim: PrismaClient, saleId: string, when: Date) {
  const sale = await sim.sale.findUniqueOrThrow({ where: { id: saleId } });
  const offset = when.getTime() - (sale.completedAt ?? sale.createdAt).getTime();
  const shift = (d: Date) => new Date(d.getTime() + offset);
  const now = new Date();
  await sim.sale.update({ where: { id: saleId }, data: { createdAt: shift(sale.createdAt), completedAt: sale.completedAt ? shift(sale.completedAt) : null } });
  for (const e of await sim.financialEntry.findMany({ where: { originType: "VENDA", originId: saleId } })) {
    const due = shift(e.dueDate);
    const settled = e.status === "PAGA" || (e.status === "ABERTA" && due < now);
    await sim.financialEntry.update({ where: { id: e.id }, data: { dueDate: due, createdAt: shift(e.createdAt), status: settled ? "PAGA" : e.status, paidAt: settled ? (e.paidAt ? shift(e.paidAt) : due) : null } });
  }
  for (const w of await sim.warranty.findMany({ where: { saleId } })) await sim.warranty.update({ where: { id: w.id }, data: { startDate: shift(w.startDate), endDate: shift(w.endDate), createdAt: shift(w.createdAt) } });
  for (const ev of await sim.deviceEvent.findMany({ where: { refType: "VENDA", refId: saleId } })) await sim.deviceEvent.update({ where: { id: ev.id }, data: { createdAt: shift(ev.createdAt) } });
  for (const m of await sim.stockMovement.findMany({ where: { refType: "VENDA", refId: saleId } })) await sim.stockMovement.update({ where: { id: m.id }, data: { createdAt: shift(m.createdAt) } });
  for (const t of await sim.task.findMany({ where: { refType: "VENDA", refId: saleId } })) {
    const due = shift(t.dueDate);
    await sim.task.update({ where: { id: t.id }, data: { dueDate: due, createdAt: when, doneAt: due < new Date(now.getTime() - DAY) ? due : null } });
  }
  // aparelhos recebidos na troca entram no estoque na data da venda
  for (const t of await sim.tradeIn.findMany({ where: { saleId } })) {
    await sim.tradeIn.update({ where: { id: t.id }, data: { createdAt: when } });
    if (t.deviceId) {
      await sim.device.update({ where: { id: t.deviceId }, data: { entryDate: when, createdAt: when } });
      await sim.deviceEvent.updateMany({ where: { deviceId: t.deviceId }, data: { createdAt: when } });
    }
  }
  await sim.document.updateMany({ where: { saleId }, data: { createdAt: when } });
  await sim.auditLog.updateMany({ where: { entity: "Sale", entityId: saleId }, data: { createdAt: when } });
}

async function moveServiceOrderTo(sim: PrismaClient, soId: string, created: Date, delivered: Date | null, due: Date | null) {
  const so = await sim.serviceOrder.findUniqueOrThrow({ where: { id: soId } });
  const offset = delivered && so.deliveredAt ? delivered.getTime() - so.deliveredAt.getTime() : 0;
  const shift = (d: Date) => new Date(d.getTime() + offset);
  await sim.serviceOrder.update({ where: { id: soId }, data: { createdAt: created, deliveredAt: delivered, dueDate: due } });
  for (const e of await sim.financialEntry.findMany({ where: { originType: "OS", originId: soId } })) {
    const d = shift(e.dueDate);
    const settled = e.status === "PAGA" || (e.status === "ABERTA" && d < new Date());
    await sim.financialEntry.update({ where: { id: e.id }, data: { dueDate: d, createdAt: delivered ?? created, status: settled ? "PAGA" : e.status, paidAt: settled ? (e.paidAt ? shift(e.paidAt) : d) : null } });
  }
  if (delivered) for (const w of await sim.warranty.findMany({ where: { serviceOrderId: soId } })) await sim.warranty.update({ where: { id: w.id }, data: { startDate: shift(w.startDate), endDate: shift(w.endDate), createdAt: delivered } });
  for (const d of await sim.document.findMany({ where: { serviceOrderId: soId } })) await sim.document.update({ where: { id: d.id }, data: { createdAt: d.type === "OS_ENTREGA" && delivered ? delivered : created } });
  await sim.stockMovement.updateMany({ where: { refType: "OS", refId: soId }, data: { createdAt: new Date(created.getTime() + DAY / 2) } });
  await sim.deviceEvent.updateMany({ where: { refType: "OS", refId: soId }, data: { createdAt: created } });
}

async function moveOrderTo(sim: PrismaClient, orderId: string, when: Date) {
  await sim.order.update({ where: { id: orderId }, data: { createdAt: when } });
  for (const e of await sim.financialEntry.findMany({ where: { originType: "ENCOMENDA", originId: orderId } })) {
    const paid = e.status === "PAGA";
    await sim.financialEntry.update({ where: { id: e.id }, data: { createdAt: when, ...(paid && e.type === "RECEBER" ? { dueDate: when, paidAt: when } : {}) } });
  }
  await sim.document.updateMany({ where: { orderId, type: "ENCOMENDA" }, data: { createdAt: when } });
}

export async function generateSimulation(user: { id: string; name: string; role: string }): Promise<SimulationMeta> {
  if (!simulationSupported()) throw new BusinessError("A simulação precisa de SQLite ou PostgreSQL.");
  const sim = await freshCopy();
  await setSimulationMode(true);
  const r = rng(Date.now());
  const now = new Date();
  const start = new Date(now.getTime() - 29 * DAY);
  start.setHours(0, 0, 0, 0);
  const dayDate = (d: number, hour = r.int(9, 18)) => {
    const x = new Date(start.getTime() + d * DAY);
    x.setHours(hour, r.int(0, 59), 0, 0);
    return x.getTime() > now.getTime() ? new Date(now.getTime() - r.int(5, 120) * 60000) : x;
  };
  const daysAgo = (n: number) => dayDate(29 - n);
  const skipped: string[] = [];
  const tx = <T,>(fn: (t: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => sim.$transaction(fn, { timeout: 30000 });
  const actor = { id: user.id, role: "ADMIN" };

  const models = (await sim.deviceModel.findMany({ where: { active: true } })).map((m) => ({ ...m, colorList: JSON.parse(m.colors) as string[], capList: JSON.parse(m.capacities) as string[] }));
  if (!models.length) throw new BusinessError("Cadastre os modelos de iPhone antes de gerar a simulação.");
  const recentModels = models.filter((m) => m.year >= 2025);
  const oldModels = models.filter((m) => m.year <= 2023);
  const sellers = await sim.user.findMany({ where: { active: true, role: { in: ["VENDEDOR", "GERENTE"] } } });
  const maquininha = await sim.financialAccount.findFirst({ where: { kind: "MAQUININHA", active: true } });

  // ── clientes: ~30, os 8 primeiros são recorrentes (compram e voltam mais) ──
  const suppliers: { id: string }[] = [];
  for (const name of ["Distribuidora Simulada Ltda", "Atacado Fictício Cell"]) suppliers.push(await sim.supplier.create({ data: { name, kind: "PJ", notes: "Simulação" } }));
  const customers: { id: string; name: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const name = `${r.pick(FIRST)} ${r.pick(LAST)} ${r.pick(LAST)}`;
    const birth = new Date(Date.UTC(r.int(1965, 2004), r.int(0, 11), r.int(1, 28), 15));
    customers.push(
      await sim.customer.create({ data: { name, phone: `119${r.int(10000000, 99999999)}`, birthDate: birth, marketingConsent: r.chance(0.7), consentAt: new Date(), notes: "Cliente fictício (simulação)", createdAt: daysAgo(r.int(20, 29)) } }),
    );
  }
  const customer = () => r.weighted(customers.map((c, i) => ({ item: c, w: i < 8 ? 4 : 1 })));

  // TACs inventados SÓ dentro da simulação (1 ou 2 por modelo), sem colidir com os reais
  const realTacs = new Set((await sim.tacEntry.findMany({ select: { tac: true } })).map((t) => t.tac));
  const tacsByModel = new Map<string, string[]>();
  const usedTacs = new Set<string>();
  const newTac = () => {
    for (;;) {
      const t = `35${String(r.int(0, 999999)).padStart(6, "0")}`;
      if (!realTacs.has(t) && !usedTacs.has(t)) return usedTacs.add(t), t;
    }
  };
  const usedImeis = new Set<string>();
  const imeiFor = (modelId: string) => {
    if (!tacsByModel.has(modelId)) tacsByModel.set(modelId, Array.from({ length: r.int(1, 2) }, newTac));
    for (;;) {
      const imei = makeImei(r.pick(tacsByModel.get(modelId)!), r.int(0, 999999));
      if (!usedImeis.has(imei)) return usedImeis.add(imei), imei;
    }
  };

  // ── 1. entradas de estoque (40–60), mais linha 17/18; ~30% sem IMEI ──
  const weight = (m: (typeof models)[number]) => (m.year >= 2025 ? 6 : m.year === 2024 ? 2 : 1);
  const total = r.int(40, 60);
  // ~30% sem IMEI, em posições sorteadas (proporção fixa, não depende da sorte)
  const noImeiSlots = new Set<number>();
  while (noImeiSlots.size < Math.round(total * 0.3)) noImeiSlots.add(r.int(0, total - 1));
  const created: { id: string; entryDay: number; price: number }[] = [];
  let withoutImei = 0;
  for (let i = 0; i < total; i++) {
    const m = r.weighted(models.map((x) => ({ item: x, w: weight(x) })));
    const entryDay = Math.min(29, Math.floor(Math.pow(r.next(), 1.6) * 30));
    const condition = m.year >= 2026 && r.chance(0.7) ? "NOVO" : "SEMINOVO";
    const capacity = r.weighted(m.capList.map((c, idx) => ({ item: c, w: idx === 0 ? 5 : idx === 1 ? 3 : 1 })));
    const salePrice = priceFor(m.name, m.capList, capacity, condition);
    const acquisitionCost = Math.round((salePrice * (condition === "NOVO" ? r.int(82, 88) : r.int(70, 82))) / 100 / 1000) * 1000;
    const hasImei = !noImeiSlots.has(i);
    if (!hasImei) withoutImei++;
    const data = deviceSchema.parse({
      imei: hasImei ? imeiFor(m.id) : "",
      modelId: m.id,
      capacity,
      color: r.pick(m.colorList),
      condition,
      batteryHealth: condition === "NOVO" ? 100 : r.int(80, 99),
      grade: condition === "NOVO" ? "A+" : r.pick(["A", "A", "B"]),
      supplierId: r.pick(suppliers).id,
      acquisitionCost,
      salePrice,
      // ~70% com preço de atacado entre o custo e o varejo; os demais usam o preço de venda na lista
      wholesalePrice: r.chance(0.7) ? Math.round((acquisitionCost + ((salePrice - acquisitionCost) * r.int(40, 60)) / 100) / 5000) * 5000 : 0,
      status: "DISPONIVEL",
    });
    const when = dayDate(entryDay);
    const d = await tx((t) => createDevice(t, { ...data, entryDate: when }, { userId: user.id, origin: "COMPRA", eventDescription: "Entrada no estoque (simulação)" }));
    await sim.device.update({ where: { id: d.id }, data: { createdAt: when } });
    await sim.deviceEvent.updateMany({ where: { deviceId: d.id }, data: { createdAt: when } });
    created.push({ id: d.id, entryDay, price: salePrice });
  }

  // ── 2. vendas (~60–70%): todas as formas de pagamento, descontos, trocas com usado ──
  const closed = new Set(Array.from({ length: r.int(2, 4) }, () => r.int(1, 28)));
  const dayWeight = (d: number) => {
    if (closed.has(d)) return 0;
    const date = new Date(start.getTime() + d * DAY);
    const dow = date.getDay();
    let w = dow === 6 ? 2.2 : dow === 0 ? 1.4 : dow === 5 ? 1.4 : 1;
    if (date.getDate() <= 5) w *= 1.7;
    return w;
  };
  const accessories = await sim.accessory.findMany({ where: { active: true, deletedAt: null, isPart: false, quantity: { gt: 3 } } });
  const toSell = created.filter(() => r.chance(0.66)).sort((a, b) => a.entryDay - b.entryDay);
  const METHODS = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "CREDITO_PARCELADO"] as const;
  const tradeSlots = new Set([2, 7, 13].filter((i) => i < toSell.length));
  let sales = 0;
  let tradeIns = 0;
  const saleIds: string[] = [];
  for (const [idx, dev] of toSell.entries()) {
    const options = Array.from({ length: 30 - dev.entryDay }, (_, k) => dev.entryDay + k).filter((d) => d > dev.entryDay || dev.entryDay === 29);
    const weights = options.map((d) => ({ item: d, w: dayWeight(d) * (1 / (1 + (d - dev.entryDay) / 10)) })).filter((x) => x.w > 0);
    if (!weights.length) continue;
    const when = dayDate(r.weighted(weights), r.int(10, 19));
    const discount = r.chance(0.3) ? Math.round((dev.price * r.int(1, 3)) / 100 / 1000) * 1000 : 0;
    const acc = accessories.length && r.chance(0.25) ? r.pick(accessories) : null;
    const totalSale = dev.price - discount + (acc ? acc.price : 0);
    // as 5 primeiras vendas cobrem cada forma de pagamento; depois, mistura realista
    const method = idx < METHODS.length ? METHODS[idx] : r.weighted([{ item: "PIX", w: 38 }, { item: "DINHEIRO", w: 8 }, { item: "DEBITO", w: 12 }, { item: "CREDITO", w: 14 }, { item: "CREDITO_PARCELADO", w: 28 }] as const);
    const old = tradeSlots.has(idx) && oldModels.length ? r.pick(oldModels) : null;
    const tradeValue = old ? Math.round((priceFor(old.name, old.capList, old.capList[0], "SEMINOVO") * 0.55) / 5000) * 5000 /* centavos, múltiplo de R$ 50 */ : 0;
    const parsed = saleSchema.parse({
      action: "CONCLUIR",
      customerId: customer().id,
      sellerId: sellers.length ? r.pick(sellers).id : null,
      items: [{ kind: "DEVICE", deviceId: dev.id, discount }, ...(acc ? [{ kind: "ACCESSORY", accessoryId: acc.id, quantity: 1, discount: 0 }] : [])],
      tradeIns: old
        ? [{ key: "t1", imei: makeImei(newTac(), r.int(0, 999999)), modelId: old.id, capacity: old.capList[0], color: r.pick(old.colorList), batteryHealth: r.int(78, 92), grade: "B", checklist: Object.fromEntries(TRADE_IN_CHECKLIST.map((c) => [c.key, true])), suggestedValue: tradeValue, finalValue: tradeValue }]
        : [],
      payments: [{ method, amount: totalSale - tradeValue, installments: method === "CREDITO_PARCELADO" ? r.pick([3, 6, 10, 12]) : 1, accountId: method.startsWith("CREDITO") || method === "DEBITO" ? (maquininha?.id ?? null) : null }],
    });
    try {
      const sale = await tx((t) => saveSale(t, parsed, actor));
      await moveSaleTo(sim, sale.id, when);
      saleIds.push(sale.id);
      sales++;
      if (old) tradeIns++;
    } catch (e) {
      skipped.push(`venda: ${(e as Error).message}`);
    }
  }
  // compras anteriores ao mês (clientes recorrentes): garantias vencendo nos próximos dias e uma já vencida
  const warrantyDays = (await getWarrantyDays(sim)).SEMINOVO?.days ?? 90;
  for (const [k, ageDays] of [warrantyDays - 2, warrantyDays - 5, warrantyDays - 6, warrantyDays + 5].entries()) {
    const m = r.pick(oldModels.length ? oldModels : models);
    const cap = m.capList[0];
    const price = priceFor(m.name, m.capList, cap, "SEMINOVO");
    const when = new Date(now.getTime() - ageDays * DAY);
    try {
      const d = await tx((t) =>
        createDevice(t, deviceSchema.parse({ imei: imeiFor(m.id), modelId: m.id, capacity: cap, color: r.pick(m.colorList), condition: "SEMINOVO", batteryHealth: r.int(84, 95), grade: "A", acquisitionCost: Math.round((price * 0.75) / 1000) * 1000, salePrice: price, status: "DISPONIVEL" }), { userId: user.id, origin: "COMPRA", eventDescription: "Entrada no estoque (compra anterior)" }),
      );
      const entry = new Date(when.getTime() - 5 * DAY);
      await sim.device.update({ where: { id: d.id }, data: { entryDate: entry, createdAt: entry } });
      await sim.deviceEvent.updateMany({ where: { deviceId: d.id }, data: { createdAt: entry } });
      const sale = await tx((t) => saveSale(t, saleSchema.parse({ action: "CONCLUIR", customerId: customers[k].id, items: [{ kind: "DEVICE", deviceId: d.id, discount: 0 }], payments: [{ method: "PIX", amount: price }] }), actor));
      await moveSaleTo(sim, sale.id, when);
    } catch (e) {
      skipped.push(`compra anterior: ${(e as Error).message}`);
    }
  }

  // uma devolução (aparelho volta ao estoque, garantia cancelada, estorno no financeiro)
  let canceledSales = 0;
  if (saleIds.length > 3) {
    try {
      await tx((t) => cancelSale(t, { id: saleIds[saleIds.length - 2], type: "DEVOLUCAO", reason: "Cliente desistiu em 7 dias (simulação)" }, actor));
      canceledSales++;
    } catch (e) {
      skipped.push(`devolução: ${(e as Error).message}`);
    }
  }

  // ── 3. ordens de serviço (~20) em todos os status, algumas atrasadas ──
  const parts = await sim.accessory.findMany({ where: { isPart: true, deletedAt: null } });
  const technician = (await sim.user.findFirst({ where: { role: "TECNICO", active: true } })) ?? (await sim.user.findFirst({ where: { role: "ADMIN" } }));
  const plan: { status: string; created: number; due: number; late?: boolean }[] = [
    ...Array.from({ length: 8 }, () => ({ status: "ENTREGUE", created: r.int(4, 27), due: 3 })),
    { status: "CANCELADA", created: r.int(5, 20), due: 3 },
    { status: "CANCELADA", created: r.int(5, 20), due: 3 },
    { status: "ABERTA", created: 0, due: 3 },
    { status: "ABERTA", created: 1, due: 2 },
    { status: "DIAGNOSTICO", created: 2, due: 3 },
    { status: "DIAGNOSTICO", created: 8, due: 3, late: true },
    { status: "AGUARDANDO_PECA", created: 4, due: 4 },
    { status: "AGUARDANDO_PECA", created: 10, due: 4, late: true },
    { status: "EM_REPARO", created: 3, due: 2 },
    { status: "EM_REPARO", created: 7, due: 3, late: true },
    { status: "PRONTA", created: 2, due: 1 },
    { status: "PRONTA", created: 5, due: 2 },
  ];
  let serviceOrders = 0;
  for (const p of plan) {
    const job = r.pick(REPAIRS);
    const m = r.weighted(models.map((x) => ({ item: x, w: x.year >= 2021 ? 3 : 1 })));
    const c = customer();
    const created = daysAgo(p.created);
    const due = new Date(created.getTime() + p.due * DAY);
    try {
      const so = await tx((t) =>
        createServiceOrder(
          t,
          soCreateSchema.parse({
            kind: "CLIENTE",
            customerId: c.id,
            modelId: m.id,
            color: r.pick(m.colorList),
            imei: r.chance(0.5) ? imeiFor(m.id) : "",
            problem: job.problem,
            services: job.services,
            price: Math.round(r.int(job.price[0], job.price[1]) / 1000) * 1000,
            laborCost: r.int(3, 8) * 1000,
            technicianId: technician?.id ?? null,
            priority: p.late ? "ALTA" : "NORMAL",
            dueDate: due.toISOString(),
            checklist: Object.fromEntries(TRADE_IN_CHECKLIST.map((x) => [x.key, true])),
          }),
          user.id,
        ),
      );
      const part = job.part ? parts.find((x) => job.part!.test(x.name)) : null;
      if (part && p.status !== "ABERTA" && p.status !== "DIAGNOSTICO") {
        await sim.accessory.update({ where: { id: part.id }, data: { quantity: { increment: 1 } } });
        await tx((t) => addPart(t, { serviceOrderId: so.id, accessoryId: part.id, quantity: 1, unitPrice: 0 }, user.id));
      }
      let delivered: Date | null = null;
      if (p.status === "ENTREGUE") {
        await tx((t) => deliverServiceOrder(t, { id: so.id, method: r.pick(["PIX", "DINHEIRO", "DEBITO", "CREDITO", "A_RECEBER"] as const) }, user.id));
        delivered = new Date(Math.min(created.getTime() + r.int(1, p.due + 1) * DAY, now.getTime() - DAY / 4));
      } else if (p.status === "CANCELADA") {
        await tx((t) => cancelServiceOrder(t, { id: so.id, reason: r.pick(["Cliente desistiu do reparo", "Orçamento não aprovado"]) }, user.id));
      } else if (p.status !== "ABERTA") {
        await tx((t) => moveServiceOrder(t, { id: so.id, status: p.status, index: 99 }, user.id));
      }
      await moveServiceOrderTo(sim, so.id, created, delivered, due);
      serviceOrders++;
    } catch (e) {
      skipped.push(`OS: ${(e as Error).message}`);
    }
  }

  // ── 4. encomendas (~10): pendentes, encomendadas, chegaram, entregues (viram venda) e uma cancelada com devolução do sinal ──
  const orderPlan = ["ABERTA", "ABERTA", "EM_BUSCA", "EM_BUSCA", "CHEGOU", "CLIENTE_AVISADO", "ENTREGUE", "ENTREGUE", "ENTREGUE", "CANCELADA"];
  let orders = 0;
  for (const [i, status] of orderPlan.entries()) {
    const m = r.pick(recentModels.length ? recentModels : models);
    const capacity = m.capList[0];
    const color = r.pick(m.colorList);
    const condition = m.year >= 2026 ? "NOVO" : "SEMINOVO";
    const agreed = priceFor(m.name, m.capList, capacity, condition);
    const deposit = i === 1 || status === "CANCELADA" || status === "ENTREGUE" || status === "CHEGOU" ? Math.round((agreed * 0.15) / 10000) * 10000 /* ~15% em centavos, múltiplo de R$ 100 */ : 0;
    const createdDay = status === "ENTREGUE" ? r.int(12, 25) : status === "CANCELADA" ? r.int(8, 15) : r.int(1, 10);
    try {
      const o = await tx((t) =>
        saveOrder(
          t,
          orderSchema.parse({
            customerId: customer().id,
            modelId: m.id,
            capacity,
            color,
            condition,
            agreedPrice: agreed,
            deposit,
            depositMethod: deposit ? r.pick(["PIX", "DINHEIRO", "DEBITO"]) : null,
            dueDate: new Date(daysAgo(createdDay).getTime() + r.int(5, 12) * DAY).toISOString(),
          }),
          user.id,
        ),
      );
      await moveOrderTo(sim, o.id, daysAgo(createdDay));
      if (status !== "ABERTA") await tx((t) => setOrderStatus(t, o.id, "EM_BUSCA", user.id));
      if (["CHEGOU", "CLIENTE_AVISADO", "ENTREGUE"].includes(status)) {
        const d = await tx((t) =>
          registerArrival(t, { orderId: o.id, imei: r.chance(0.8) ? imeiFor(m.id) : null, capacity, color, condition: condition as "NOVO", batteryHealth: null, acquisitionCost: Math.round(agreed * 0.84 / 1000) * 1000, salePrice: agreed }, user.id),
        );
        const arrived = daysAgo(Math.max(0, createdDay - r.int(3, 8)));
        await sim.device.update({ where: { id: d.id }, data: { entryDate: arrived, createdAt: arrived } });
        if (status === "CLIENTE_AVISADO") await tx((t) => setOrderStatus(t, o.id, "CLIENTE_AVISADO", user.id));
        if (status === "ENTREGUE") {
          const sale = await tx((t) => deliverOrder(t, { orderId: o.id, method: r.pick(["PIX", "CREDITO_PARCELADO", "DEBITO"] as const), installments: 10 }, actor));
          await moveSaleTo(sim, sale.id, new Date(Math.min(arrived.getTime() + r.int(1, 3) * DAY, now.getTime() - DAY / 4)));
          sales++;
        }
      }
      if (status === "CANCELADA") await tx((t) => cancelOrder(t, { id: o.id, reason: "Cliente desistiu da encomenda (simulação)", refund: true }, user.id));
      orders++;
    } catch (e) {
      skipped.push(`encomenda: ${(e as Error).message}`);
    }
  }

  // ── 5. garantias: geradas pelas vendas/OS; ~5 acionamentos (aprovados, negado por mau uso, em análise) ──
  const active = await sim.warranty.findMany({ where: { status: "ATIVA", kind: "VENDA", deviceId: { not: null }, startDate: { gte: start }, endDate: { gt: now } }, orderBy: { startDate: "asc" }, take: 5 });
  const claimPlan = [
    { problem: "Bateria esquentando e descarregando rápido", decide: "APPROVE_DELIVER" },
    { problem: "Face ID parou de funcionar", decide: "APPROVE" },
    { problem: "Tela com mancha após queda", decide: "DENY" },
    { problem: "Alto-falante com chiado", decide: null },
    { problem: "Não reconhece o chip", decide: null },
  ] as const;
  let claims = 0;
  for (const [i, w] of active.entries()) {
    const cp = claimPlan[i];
    try {
      const c = await tx((t) => claimWarranty(t, { warrantyId: w.id, problem: cp.problem }, user.id));
      const when = new Date(Math.max(w.startDate.getTime() + DAY, now.getTime() - r.int(1, 6) * DAY));
      await sim.warrantyClaim.update({ where: { id: c.id }, data: { createdAt: when } });
      if (cp.decide === "DENY") await tx((t) => denyClaim(t, { claimId: c.id, reason: "Mau uso: tela trincada por queda — dano físico não coberto pela garantia" }, user.id));
      if (cp.decide === "APPROVE" || cp.decide === "APPROVE_DELIVER") {
        const so = await tx((t) => approveClaim(t, { claimId: c.id, note: "Defeito de funcionamento confirmado na análise" }, user.id));
        if (cp.decide === "APPROVE_DELIVER") {
          await tx((t) => moveServiceOrder(t, { id: so.id, status: "EM_REPARO", index: 0 }, user.id));
          await tx((t) => deliverServiceOrder(t, { id: so.id }, user.id));
          await moveServiceOrderTo(sim, so.id, when, new Date(Math.min(when.getTime() + 2 * DAY, now.getTime() - DAY / 8)), new Date(when.getTime() + 5 * DAY));
        } else {
          await tx((t) => moveServiceOrder(t, { id: so.id, status: "EM_REPARO", index: 0 }, user.id));
          await moveServiceOrderTo(sim, so.id, when, null, new Date(when.getTime() + 5 * DAY));
        }
      }
      claims++;
    } catch (e) {
      skipped.push(`garantia: ${(e as Error).message}`);
    }
  }

  // ── casos para testar os avisos de IMEI no próprio cadastro ──
  const cases: SimulationCase[] = [];
  const sample = await sim.device.findFirst({ where: { imei: { not: null }, origin: "COMPRA" }, include: { model: true }, orderBy: { entryDate: "asc" } });
  if (sample?.imei) {
    const wrong = sample.imei.slice(0, 14) + String((Number(sample.imei[14]) + 3) % 10);
    const parsed = deviceSchema.safeParse({ imei: wrong, modelId: sample.modelId, capacity: sample.capacity, color: sample.color, condition: "SEMINOVO", acquisitionCost: 0, salePrice: 0 });
    cases.push({ key: "LUHN", title: "IMEI digitado errado (dígito verificador)", imei: wrong, detail: `Último dígito trocado do IMEI ${sample.imei}`, result: parsed.success ? "aceito (não deveria)" : parsed.error.issues[0].message, ok: !parsed.success });
    cases.push({ key: "DUPLICADO", title: "Tentativa de IMEI duplicado", imei: sample.imei, detail: `${sample.model.name} já está no estoque simulado`, result: "IMEI já cadastrado", ok: true });
    const other = models.find((x) => x.id !== sample.modelId && x.year >= 2024) ?? models.find((x) => x.id !== sample.modelId)!;
    let tacImei = makeImei(sample.imei.slice(0, 8), r.int(0, 999999));
    while (usedImeis.has(tacImei)) tacImei = makeImei(sample.imei.slice(0, 8), r.int(0, 999999));
    cases.push({ key: "TAC", title: "Modelo diferente do TAC já conhecido", imei: tacImei, detail: `TAC ${sample.imei.slice(0, 8)} aprendido como ${sample.model.name}; escolha ${other.name} no cadastro`, result: `Este IMEI costuma ser do ${sample.model.name}. Confirma?`, ok: true });
  }

  const meta: SimulationMeta = {
    generatedAt: new Date().toISOString(),
    generatedBy: user.name,
    days: 30,
    devices: created.length,
    withoutImei,
    sales,
    tradeIns,
    canceledSales,
    serviceOrders,
    orders,
    claims,
    customers: customers.length,
    tacs: usedTacs.size,
    skipped,
    cases,
  };
  await saveState({ meta });
  return meta;
}

/** Sai do modo simulação mantendo os dados simulados (dá para voltar depois). */
export async function pauseSimulation() {
  await setSimulationMode(false);
}

export async function resumeSimulation() {
  if (!(await simulationExists())) throw new BusinessError("Não há simulação gerada.");
  await setSimulationMode(true);
}

/** Apaga só a simulação; o banco real não é tocado. */
export async function deleteSimulation() {
  await dropSimulation();
}

