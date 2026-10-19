// Modo simulação: 1 mês de operação fictícia num banco separado (prisma/simulacao.db).
// O banco real nunca é tocado: a simulação começa como cópia das configurações (usuários, loja,
// catálogo, taxas, acessórios, TACs reais) e todo o resto é gerado só nela.
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { SIM_DB_FILE, closeSimClient, isSimulation, realDb, realDbFile, setSimulationMode, simClient, simulationSupported } from "@/lib/db";
import { makeImei } from "@/domain/imei";
import { priceFor } from "@/domain/pricing";
import { deviceSchema } from "@/features/devices/schemas";
import { createDevice } from "@/features/devices/service";
import { saveSale } from "@/features/sales/service";
import { saleSchema } from "@/features/sales/schemas";

const META_FILE = path.join(path.dirname(SIM_DB_FILE), "simulacao.json");
const DAY = 86400000;

export type SimulationCase = { key: "LUHN" | "DUPLICADO" | "TAC"; title: string; imei: string; detail: string; result: string; ok: boolean };
export type SimulationMeta = {
  generatedAt: string;
  generatedBy: string;
  days: number;
  devices: number;
  withoutImei: number;
  sales: number;
  tacs: number;
  cases: SimulationCase[];
};

export function simulationStatus() {
  const exists = fs.existsSync(SIM_DB_FILE);
  const meta = exists && fs.existsSync(META_FILE) ? (JSON.parse(fs.readFileSync(META_FILE, "utf8")) as SimulationMeta) : null;
  return { supported: simulationSupported(), exists, active: isSimulation(), meta };
}

/** Gerador pseudoaleatório (mulberry32): cada simulação nova é diferente, mas estável durante a geração. */
function rng(seed: number) {
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
  "AuditLog", "Notification", "DeviceEvent", "ImeiCheck", "StockMovement", "SaleItem", "SalePayment", "TradeIn", "Sale",
  "ServiceOrderPart", "ServiceOrder", "Document", "PurchaseItem", "PurchaseOrder", "UsedDevicePurchase", "Order",
  "CashMovement", "CashSession", "FinancialEntry", "Task", "CampaignSend", "Device", "Customer", "Supplier", "Sequence",
];

async function freshCopy(): Promise<PrismaClient> {
  setSimulationMode(false);
  await closeSimClient();
  for (const f of [SIM_DB_FILE, `${SIM_DB_FILE}-journal`, META_FILE]) if (fs.existsSync(f)) fs.unlinkSync(f);
  if (!fs.existsSync(realDbFile())) throw new BusinessError("Banco real não encontrado.");
  // cópia consistente do banco real (configurações incluídas)
  await realDb.$executeRawUnsafe(`VACUUM INTO '${SIM_DB_FILE.replace(/'/g, "''")}'`);
  const sim = simClient();
  await sim.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const t of OPERATIONAL) await sim.$executeRawUnsafe(`DELETE FROM "${t}"`);
  await sim.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  // a simulação começa com saldos zerados nas contas
  await sim.financialAccount.updateMany({ data: { initialBalance: 0 } });
  return sim;
}

const FIRST = ["Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Marcos", "Natália", "Otávio", "Patrícia", "Rafael", "Sabrina", "Thiago", "Vanessa", "Beatriz", "Caio", "Daniela", "Enzo", "Fernanda", "Gustavo", "Helena", "Júlia", "Leonardo", "Mariana", "Pedro"];
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Rocha", "Dias"];

/** Desloca para `when` tudo o que uma venda feita "agora" gerou. */
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
  for (const ev of await sim.deviceEvent.findMany({ where: { refType: "VENDA", refId: saleId } })) await sim.deviceEvent.update({ where: { id: ev.id }, data: { createdAt: shift(ev.createdAt) } });
  for (const m of await sim.stockMovement.findMany({ where: { refType: "VENDA", refId: saleId } })) await sim.stockMovement.update({ where: { id: m.id }, data: { createdAt: shift(m.createdAt) } });
  for (const t of await sim.task.findMany({ where: { refType: "VENDA", refId: saleId } })) {
    const due = shift(t.dueDate);
    await sim.task.update({ where: { id: t.id }, data: { dueDate: due, createdAt: when, doneAt: due < new Date(now.getTime() - DAY) ? due : null } });
  }
  await sim.document.updateMany({ where: { saleId }, data: { createdAt: when } });
  await sim.auditLog.updateMany({ where: { entity: "Sale", entityId: saleId }, data: { createdAt: when } });
}

export async function generateSimulation(user: { id: string; name: string; role: string }): Promise<SimulationMeta> {
  if (!simulationSupported()) throw new BusinessError("A simulação funciona com o banco local (SQLite). Em produção, use um banco de testes separado.");
  const sim = await freshCopy();
  setSimulationMode(true);
  const r = rng(Date.now());
  const now = new Date();
  const start = new Date(now.getTime() - 29 * DAY);
  start.setHours(0, 0, 0, 0);
  const dayDate = (d: number, hour = r.int(9, 18)) => {
    const x = new Date(start.getTime() + d * DAY);
    x.setHours(hour, r.int(0, 59), 0, 0);
    return x.getTime() > now.getTime() ? new Date(now.getTime() - r.int(5, 120) * 60000) : x;
  };

  const models = (await sim.deviceModel.findMany({ where: { active: true } })).map((m) => ({ ...m, colorList: JSON.parse(m.colors) as string[], capList: JSON.parse(m.capacities) as string[] }));
  if (!models.length) throw new BusinessError("Cadastre os modelos de iPhone antes de gerar a simulação.");
  const sellers = await sim.user.findMany({ where: { active: true, role: { in: ["VENDEDOR", "GERENTE"] } } });
  const actor = { id: user.id, role: "ADMIN" };
  const maquininha = await sim.financialAccount.findFirst({ where: { kind: "MAQUININHA", active: true } });

  // fornecedores e clientes fictícios
  const suppliers = [];
  for (const name of ["Distribuidora Simulada Ltda", "Atacado Fictício Cell"]) suppliers.push(await sim.supplier.create({ data: { name, kind: "PJ", notes: "Simulação" } }));
  const customers = [];
  for (let i = 0; i < 30; i++) {
    const name = `${r.pick(FIRST)} ${r.pick(LAST)} ${r.pick(LAST)}`;
    customers.push(await sim.customer.create({ data: { name, phone: `119${r.int(10000000, 99999999)}`, marketingConsent: r.chance(0.7), consentAt: new Date(), notes: "Cliente fictício (simulação)" } }));
  }

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

  // ── entradas de estoque ──
  const recent = (m: (typeof models)[number]) => (m.year >= 2025 ? 6 : m.year === 2024 ? 2 : 1);
  const total = r.int(40, 60);
  const created: { id: string; entryDay: number; price: number }[] = [];
  let withoutImei = 0;
  for (let i = 0; i < total; i++) {
    const m = r.weighted(models.map((x) => ({ item: x, w: recent(x) })));
    // mais entradas nas primeiras semanas, para dar tempo de vender
    const entryDay = Math.min(29, Math.floor(Math.pow(r.next(), 1.6) * 30));
    const condition = m.year >= 2026 && r.chance(0.7) ? "NOVO" : "SEMINOVO";
    const capacity = r.weighted(m.capList.map((c, idx) => ({ item: c, w: idx === 0 ? 5 : idx === 1 ? 3 : 1 })));
    const salePrice = priceFor(m.name, m.capList, capacity, condition);
    const acquisitionCost = Math.round((salePrice * (condition === "NOVO" ? r.int(82, 88) : r.int(70, 82))) / 100 / 1000) * 1000;
    const hasImei = r.chance(0.7);
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
      status: "DISPONIVEL",
    });
    const when = dayDate(entryDay);
    const d = await sim.$transaction((tx) => createDevice(tx, { ...data, entryDate: when }, { userId: user.id, origin: "COMPRA", eventDescription: "Entrada no estoque (simulação)" }));
    await sim.device.update({ where: { id: d.id }, data: { createdAt: when } });
    await sim.deviceEvent.updateMany({ where: { deviceId: d.id }, data: { createdAt: when } });
    created.push({ id: d.id, entryDay, price: salePrice });
  }

  // ── vendas: ~60–70% dos aparelhos; fins de semana e início do mês vendem mais; alguns dias sem venda ──
  const closed = new Set(Array.from({ length: r.int(3, 5) }, () => r.int(1, 28)));
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
  let sales = 0;
  for (const dev of toSell) {
    const options = Array.from({ length: 30 - dev.entryDay }, (_, k) => dev.entryDay + k).filter((d) => d > dev.entryDay || dev.entryDay === 29);
    const weights = options.map((d) => ({ item: d, w: dayWeight(d) * (1 / (1 + (d - dev.entryDay) / 10)) })).filter((x) => x.w > 0);
    if (!weights.length) continue;
    const saleDay = r.weighted(weights);
    const when = dayDate(saleDay, r.int(10, 19));
    const discount = r.chance(0.3) ? Math.round((dev.price * r.int(1, 3)) / 100 / 1000) * 1000 : 0;
    const acc = accessories.length && r.chance(0.25) ? r.pick(accessories) : null;
    const totalSale = dev.price - discount + (acc ? acc.price : 0);
    const method = r.weighted([
      { item: "PIX", w: 40 },
      { item: "DEBITO", w: 12 },
      { item: "CREDITO", w: 18 },
      { item: "CREDITO_PARCELADO", w: 30 },
    ] as const);
    const parsed = saleSchema.parse({
      action: "CONCLUIR",
      customerId: r.pick(customers).id,
      sellerId: sellers.length ? r.pick(sellers).id : null,
      items: [{ kind: "DEVICE", deviceId: dev.id, discount }, ...(acc ? [{ kind: "ACCESSORY", accessoryId: acc.id, quantity: 1, discount: 0 }] : [])],
      payments: [{ method, amount: totalSale, installments: method === "CREDITO_PARCELADO" ? r.pick([3, 6, 10, 12]) : 1, accountId: method.startsWith("CREDITO") || method === "DEBITO" ? (maquininha?.id ?? null) : null }],
    });
    try {
      const sale = await sim.$transaction((tx) => saveSale(tx, parsed, actor), { timeout: 20000 });
      await moveSaleTo(sim, sale.id, when);
      sales++;
    } catch (e) {
      // venda impossível (ex.: acessório esgotado) não derruba a simulação
      console.warn("[simulação] venda ignorada:", (e as Error).message);
    }
  }

  // ── casos para testar os avisos ──
  const cases: SimulationCase[] = [];
  const sample = await sim.device.findFirst({ where: { imei: { not: null } }, include: { model: true }, orderBy: { entryDate: "asc" } });
  if (sample?.imei) {
    const wrong = sample.imei.slice(0, 14) + String((Number(sample.imei[14]) + 3) % 10);
    const parsed = deviceSchema.safeParse({ imei: wrong, modelId: sample.modelId, capacity: sample.capacity, color: sample.color, condition: "SEMINOVO", acquisitionCost: 0, salePrice: 0 });
    const msg = parsed.success ? "aceito (não deveria)" : parsed.error.issues[0].message;
    cases.push({ key: "LUHN", title: "IMEI digitado errado (dígito verificador)", imei: wrong, detail: `Último dígito trocado do IMEI ${sample.imei}`, result: msg, ok: !parsed.success });

    const dup = await sim
      .$transaction((tx) => createDevice(tx, { ...deviceSchema.parse({ imei: sample.imei, modelId: sample.modelId, capacity: sample.capacity, color: sample.color, condition: "SEMINOVO", acquisitionCost: 0, salePrice: 0 }) }, { userId: user.id, checkTac: true }))
      .then(() => "aceito (não deveria)")
      .catch((e: Error) => e.message);
    cases.push({ key: "DUPLICADO", title: "Tentativa de IMEI duplicado", imei: sample.imei, detail: `${sample.model.name} já está no estoque simulado`, result: dup, ok: dup !== "aceito (não deveria)" });

    const other = models.find((m) => m.id !== sample.modelId && m.year >= 2024) ?? models.find((m) => m.id !== sample.modelId)!;
    const tacImei = (() => {
      for (;;) {
        const x = makeImei(sample.imei.slice(0, 8), r.int(0, 999999));
        if (!usedImeis.has(x)) return x;
      }
    })();
    const mism = await sim
      .$transaction((tx) => createDevice(tx, { ...deviceSchema.parse({ imei: tacImei, modelId: other.id, capacity: other.capList[0], color: other.colorList[0], condition: "SEMINOVO", acquisitionCost: 0, salePrice: 0 }) }, { userId: user.id, checkTac: true }))
      .then(() => "aceito sem aviso (não deveria)")
      .catch((e: Error) => e.message);
    cases.push({ key: "TAC", title: "Modelo diferente do TAC já conhecido", imei: tacImei, detail: `TAC ${sample.imei.slice(0, 8)} aprendido como ${sample.model.name}; escolha ${other.name} no cadastro`, result: mism, ok: mism.includes("costuma ser") });
  }

  const meta: SimulationMeta = {
    generatedAt: new Date().toISOString(),
    generatedBy: user.name,
    days: 30,
    devices: created.length,
    withoutImei,
    sales,
    tacs: usedTacs.size,
    cases,
  };
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  return meta;
}

/** Sai do modo simulação mantendo o arquivo (dá para voltar depois). */
export function pauseSimulation() {
  setSimulationMode(false);
}

export function resumeSimulation() {
  if (!fs.existsSync(SIM_DB_FILE)) throw new BusinessError("Não há simulação gerada.");
  setSimulationMode(true);
}

/** Apaga só a simulação; o banco real não é tocado. */
export async function deleteSimulation() {
  setSimulationMode(false);
  await closeSimClient();
  for (const f of [SIM_DB_FILE, `${SIM_DB_FILE}-journal`, META_FILE]) if (fs.existsSync(f)) fs.unlinkSync(f);
}
