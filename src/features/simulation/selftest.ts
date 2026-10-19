// "Teste do app": exercita cada função com os mesmos serviços das telas, dentro da simulação,
// e confere o painel contra a soma dos registros. No fim apaga a simulação, verifica que o banco
// real ficou idêntico e gera uma simulação nova e limpa para você explorar.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { SIM_DB_FILE, isSimulation, realDb, simClient } from "@/lib/db";
import { makeImei, validateImei } from "@/domain/imei";
import { TRADE_IN_CHECKLIST } from "@/domain/constants";
import { matchesSearch } from "@/lib/search";
import { deviceSchema } from "@/features/devices/schemas";
import { createDevice, softDeleteDevice, updateDevice } from "@/features/devices/service";
import { listDevices } from "@/features/devices/queries";
import { deviceSearchText } from "@/features/devices/search";
import { cancelSale, saveSale } from "@/features/sales/service";
import { saleSchema } from "@/features/sales/schemas";
import { soCreateSchema } from "@/features/service-orders/schemas";
import { cancelServiceOrder, createServiceOrder, deliverServiceOrder, moveServiceOrder } from "@/features/service-orders/service";
import { orderSchema } from "@/features/orders/schemas";
import { cancelOrder, deliverOrder, registerArrival, saveOrder, setOrderStatus } from "@/features/orders/service";
import { approveClaim, claimWarranty, denyClaim } from "@/features/warranty/service";
import { getDashboard } from "@/features/dashboard/queries";
import { deleteSimulation, generateSimulation, type SimulationMeta } from "./service";

const REPORT_FILE = path.join(path.dirname(SIM_DB_FILE), "teste-app.json");
const DAY = 86400000;

export type TestItem = { group: string; name: string; ok: boolean; detail: string };
export type TestReport = { startedAt: string; finishedAt: string; ok: number; failed: number; items: TestItem[]; meta: SimulationMeta | null };

export function lastReport(): TestReport | null {
  return fs.existsSync(REPORT_FILE) ? (JSON.parse(fs.readFileSync(REPORT_FILE, "utf8")) as TestReport) : null;
}

/** Impressão digital do banco real (dados de negócio), para provar que a simulação não o alterou. */
async function fingerprint(db: PrismaClient) {
  const tables = {
    device: await db.device.findMany({ orderBy: { id: "asc" } }),
    sale: await db.sale.findMany({ orderBy: { id: "asc" } }),
    saleItem: await db.saleItem.findMany({ orderBy: { id: "asc" } }),
    customer: await db.customer.findMany({ orderBy: { id: "asc" } }),
    supplier: await db.supplier.findMany({ orderBy: { id: "asc" } }),
    serviceOrder: await db.serviceOrder.findMany({ orderBy: { id: "asc" } }),
    order: await db.order.findMany({ orderBy: { id: "asc" } }),
    warranty: await db.warranty.findMany({ orderBy: { id: "asc" } }),
    financialEntry: await db.financialEntry.findMany({ orderBy: { id: "asc" } }),
    tacEntry: await db.tacEntry.findMany({ orderBy: { tac: "asc" } }),
    accessory: await db.accessory.findMany({ orderBy: { id: "asc" } }),
    deviceModel: await db.deviceModel.findMany({ orderBy: { id: "asc" } }),
    storeSettings: await db.storeSettings.findMany(),
  };
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  const hash = createHash("sha256").update(JSON.stringify(tables)).digest("hex").slice(0, 16);
  return { hash, counts };
}

export async function runAppTest(user: { id: string; name: string; role: string }): Promise<TestReport> {
  const startedAt = new Date().toISOString();
  const items: TestItem[] = [];
  const t = async (group: string, name: string, fn: () => Promise<string>) => {
    try {
      items.push({ group, name, ok: true, detail: await fn() });
    } catch (e) {
      items.push({ group, name, ok: false, detail: (e as Error).message });
    }
  };
  const expect = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  const realBefore = await fingerprint(realDb);
  const meta = await generateSimulation(user);
  expect(isSimulation(), "modo simulação não ativou");
  const sim = simClient();
  const tx = <T,>(fn: (t: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => sim.$transaction(fn, { timeout: 30000 });
  const actor = { id: user.id, role: "ADMIN" };
  const now = new Date();
  let seq = Math.floor(Math.random() * 900000);
  const tac = `35${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const models = await sim.deviceModel.findMany({ where: { active: true }, orderBy: { year: "desc" } });
  const [mA, mB] = [models[0], models[1]];
  const capA = (JSON.parse(mA.capacities) as string[])[0];
  const colA = (JSON.parse(mA.colors) as string[])[0];
  const base = (over: Record<string, unknown> = {}) =>
    deviceSchema.parse({ imei: "", modelId: mA.id, capacity: capA, color: colA, condition: "SEMINOVO", batteryHealth: 90, grade: "A", acquisitionCost: 300000, salePrice: 400000, status: "DISPONIVEL", ...over });
  const newDevice = async (over: Record<string, unknown> = {}) => tx((x) => createDevice(x, base(over), { userId: user.id, origin: "COMPRA", checkTac: true }));
  const customer = await sim.customer.create({ data: { name: "Cliente Teste do App", phone: "11999990000", marketingConsent: true } });
  const maq = await sim.financialAccount.findFirst({ where: { kind: "MAQUININHA" } });

  // ── A simulação gerada tem tudo o que foi pedido? ──
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  await t("Simulação gerada", "Clientes (~30, com recorrentes)", async () => {
    const n = await sim.customer.count({ where: { notes: "Cliente fictício (simulação)" } });
    const repeat = await sim.customer.count({ where: { notes: "Cliente fictício (simulação)", OR: [{ sales: { some: {} } }, { serviceOrders: { some: {} } }, { orders: { some: {} } }] } });
    const multi = (await sim.sale.groupBy({ by: ["customerId"], _count: true, where: { status: "CONCLUIDA" } })).filter((g) => g._count > 1).length;
    expect(n === 30 && multi >= 3, `clientes ${n}, recorrentes ${multi}`);
    return `${n} clientes, ${repeat} com histórico, ${multi} compraram mais de uma vez`;
  });
  await t("Simulação gerada", "Estoque (40–60 entradas, ~30% sem IMEI, mais linha 17/18)", async () => {
    const entries = await sim.device.findMany({ where: { origin: "COMPRA", entryDate: { gte: monthAgo }, reservedForOrderId: null, saleItems: { none: { sale: { orderId: { not: null } } } } }, include: { model: true } });
    const noImei = entries.filter((d) => !d.imei).length;
    const recent = entries.filter((d) => d.model.year >= 2025).length;
    const pct = Math.round((noImei / entries.length) * 100);
    expect(entries.length >= 40 && entries.length <= 60, `${entries.length} entradas`);
    expect(pct >= 25 && pct <= 35, `${pct}% sem IMEI`);
    expect(recent / entries.length >= 0.55, `só ${recent} da linha 17/18`);
    return `${entries.length} entradas, ${noImei} sem IMEI (${pct}%), ${recent} da linha 17/18`;
  });
  await t("Simulação gerada", "Vendas com todas as formas de pagamento, descontos e trocas", async () => {
    const pays = await sim.salePayment.groupBy({ by: ["method"], _count: true, where: { sale: { status: { in: ["CONCLUIDA", "DEVOLVIDA"] } } } });
    const methods = new Set(pays.map((p) => p.method));
    const missing = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "CREDITO_PARCELADO", "TROCA", "SINAL"].filter((m) => !methods.has(m));
    const discounts = await sim.saleItem.count({ where: { discount: { gt: 0 } } });
    const trades = await sim.tradeIn.count({ where: { deviceId: { not: null } } });
    expect(!missing.length, `faltou: ${missing.join(", ")}`);
    expect(trades >= 2 && discounts > 0, `${trades} trocas, ${discounts} descontos`);
    return `Dinheiro, Pix, débito, crédito, parcelado, troca e sinal; ${discounts} com desconto; ${trades} trocas com usado`;
  });
  await t("Simulação gerada", "OS (~20) em todos os status, com atrasadas", async () => {
    const byStatus = await sim.serviceOrder.groupBy({ by: ["status"], _count: true, where: { kind: "CLIENTE" } });
    const statuses = new Set(byStatus.map((b) => b.status));
    const missing = ["ABERTA", "DIAGNOSTICO", "AGUARDANDO_PECA", "EM_REPARO", "PRONTA", "ENTREGUE", "CANCELADA"].filter((s) => !statuses.has(s));
    const total = byStatus.reduce((a, b) => a + b._count, 0);
    const late = await sim.serviceOrder.count({ where: { status: { notIn: ["ENTREGUE", "CANCELADA"] }, dueDate: { lt: now } } });
    expect(!missing.length && total >= 18 && late >= 2, `faltou ${missing.join(", ")}; ${total} OS; ${late} atrasadas`);
    return `${total} OS em todos os status; ${late} atrasadas`;
  });
  await t("Simulação gerada", "Encomendas (~10), com sinal e cancelada com devolução", async () => {
    const all = await sim.order.findMany();
    const st = new Set(all.map((o) => o.status));
    const refund = await sim.financialEntry.count({ where: { originType: "ENCOMENDA", type: "PAGAR" } });
    const delivered = all.filter((o) => o.status === "ENTREGUE").length;
    expect(all.length >= 10 && all.some((o) => o.deposit > 0) && st.has("CANCELADA") && refund > 0 && delivered > 0 && st.has("CHEGOU"), `${all.length} encomendas, status ${[...st].join("/")}`);
    return `${all.length} encomendas: ${[...st].length} status diferentes, ${delivered} viraram venda, 1 cancelada com sinal devolvido`;
  });
  await t("Simulação gerada", "Garantias e ~5 acionamentos (um negado por mau uso)", async () => {
    const claims = await sim.warrantyClaim.findMany();
    const denied = claims.find((c) => c.status === "NEGADO");
    const expiring = await sim.warranty.count({ where: { status: "ATIVA", endDate: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } } });
    const expired = await sim.warranty.count({ where: { status: "ATIVA", endDate: { lt: now } } });
    expect(claims.length >= 5 && denied?.decisionNote && expiring > 0 && expired > 0, `${claims.length} acionamentos, ${expiring} vencendo, ${expired} vencidas`);
    return `${claims.length} acionamentos (negado: “${denied!.decisionNote}”); ${expiring} vencendo em 7 dias; ${expired} vencida(s)`;
  });

  await t("Simulação gerada", "Valores plausíveis (sinal, troca, desconto, margem)", async () => {
    const orders = await sim.order.findMany({ where: { deposit: { gt: 0 }, agreedPrice: { not: null } } });
    const badDeposit = orders.filter((o) => o.deposit < o.agreedPrice! * 0.1 || o.deposit > o.agreedPrice! * 0.2);
    const trades = await sim.tradeIn.findMany({ where: { deviceId: { not: null } } });
    const badTrade = trades.filter((x) => x.finalValue < 30000 || x.finalValue > 1000000);
    const items = await sim.saleItem.findMany({ where: { kind: "DEVICE", active: true } });
    const badDiscount = items.filter((i) => i.discount > i.unitPrice * 0.05);
    const negative = items.filter((i) => i.unitPrice - i.discount < i.unitCost);
    expect(!badDeposit.length && !badTrade.length && !badDiscount.length, `sinais fora de 10–20%: ${badDeposit.length}; trocas fora de R$ 300–10.000: ${badTrade.length}; descontos > 5%: ${badDiscount.length}`);
    expect(negative.length <= items.length * 0.1, `${negative.length} vendas abaixo do custo`);
    const avgTrade = trades.length ? trades.reduce((a, x) => a + x.finalValue, 0) / trades.length / 100 : 0;
    return `Sinais entre 10% e 20% do combinado; troca média R$ ${avgTrade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}; descontos até 5%; ${negative.length} venda(s) abaixo do custo`;
  });

  // ── Estoque ──
  const imei1 = makeImei(tac, seq++);
  let withImeiId = "";
  await t("Estoque", "Cadastrar aparelho com IMEI", async () => {
    const d = await newDevice({ imei: imei1 });
    withImeiId = d.id;
    expect(d.imei === imei1, "IMEI não gravado");
    return `${mA.name} cadastrado com IMEI ${imei1}`;
  });
  let noImeiId = "";
  await t("Estoque", "Cadastrar aparelho sem IMEI", async () => {
    const d = await newDevice();
    noImeiId = d.id;
    expect(d.imei === null, "deveria ficar sem IMEI");
    return "Cadastrado só com modelo, cor e armazenamento (aparece como “Sem IMEI”)";
  });
  await t("Estoque", "IMEI inválido é recusado", async () => {
    const bad = imei1.slice(0, 14) + String((Number(imei1[14]) + 1) % 10);
    const r = deviceSchema.safeParse({ ...base(), imei: bad });
    expect(!r.success, "IMEI inválido foi aceito");
    const msg = r.success ? "" : r.error.issues[0].message;
    expect(msg === "IMEI inválido, confira a digitação", `mensagem inesperada: ${msg}`);
    return `“${msg}”`;
  });
  await t("Estoque", "IMEI duplicado é bloqueado", async () => {
    const err = await newDevice({ imei: imei1 }).then(() => null, (e: Error) => e.message);
    expect(err && /já cadastrado/.test(err), "duplicado foi aceito");
    return `“${err}”`;
  });
  await t("Estoque", "Reconhecimento do modelo pelo TAC", async () => {
    const learned = await sim.tacEntry.findUnique({ where: { tac }, include: { model: true } });
    expect(learned?.modelId === mA.id, "TAC não foi aprendido no primeiro cadastro");
    const second = makeImei(tac, seq++);
    expect(validateImei(second).luhnOk, "IMEI de teste inválido");
    const found = await sim.tacEntry.findUnique({ where: { tac: second.slice(0, 8) }, include: { model: true } });
    expect(found?.model.name === mA.name, "segundo IMEI não reconhecido");
    return `TAC ${tac} aprendido no 1º cadastro; o 2º IMEI foi reconhecido como “${found!.model.name}”`;
  });
  await t("Estoque", "Aviso de divergência TAC × modelo", async () => {
    const imei = makeImei(tac, seq++);
    const err = await newDevice({ imei, modelId: mB.id, capacity: (JSON.parse(mB.capacities) as string[])[0], color: (JSON.parse(mB.colors) as string[])[0] }).then(
      () => null,
      (e: Error) => e.message,
    );
    expect(err === `Este IMEI costuma ser do ${mA.name}. Confirma?`, `aviso não apareceu (${err})`);
    const ok = await tx((x) =>
      createDevice(x, { ...base({ imei, modelId: mB.id, capacity: (JSON.parse(mB.capacities) as string[])[0], color: (JSON.parse(mB.colors) as string[])[0] }), confirmTacMismatch: true }, { userId: user.id, checkTac: true }),
    );
    expect(ok.modelId === mB.id, "não salvou após confirmar");
    return `“${err}” — confirmado, salvou como ${mB.name}`;
  });
  await t("Estoque", "Editar aparelho (preço e IMEI informado depois)", async () => {
    const d = await sim.device.findUniqueOrThrow({ where: { id: noImeiId } });
    const later = makeImei(tac, seq++);
    await tx((x) => updateDevice(x, d.id, { ...base({ imei: later }), salePrice: 410000 }, user.id));
    const after = await sim.device.findUniqueOrThrow({ where: { id: d.id } });
    expect(after.salePrice === 410000 && after.imei === later, "edição não gravou");
    return "Preço alterado para R$ 4.100,00 e IMEI informado depois do cadastro";
  });
  await t("Estoque", "Excluir aparelho", async () => {
    const d = await newDevice();
    await tx((x) => softDeleteDevice(x, d.id, "Teste do app", user.id));
    const rows = await listDevices("ADMIN", { includeSold: true });
    expect(!rows.some((r) => r.id === d.id), "aparelho excluído continua na lista");
    return "Some do estoque e mantém o histórico";
  });
  const rows = await listDevices("ADMIN", { includeSold: true });
  const search = (q: string) => rows.filter((r) => matchesSearch(deviceSearchText(r), q));
  await t("Estoque", "Buscar por modelo", async () => {
    const res = search(mA.name);
    expect(res.length > 0 && res.every((r) => deviceSearchText(r).toLowerCase().includes(mA.name.toLowerCase())), "resultado inconsistente");
    return `“${mA.name}”: ${res.length} aparelho(s)`;
  });
  await t("Estoque", "Buscar por cor", async () => {
    const color = rows.find((r) => r.color.length > 4)?.color ?? colA;
    const res = search(color);
    expect(res.length > 0, "nenhum resultado");
    return `“${color}”: ${res.length} aparelho(s)`;
  });
  await t("Estoque", "Buscar por IMEI", async () => {
    const res = search(imei1);
    expect(res.length === 1 && res[0].id === withImeiId, "não encontrou exatamente o aparelho");
    return `IMEI ${imei1}: 1 aparelho`;
  });
  await t("Estoque", "Buscar por cliente", async () => {
    const sold = rows.find((r) => r.customer);
    expect(sold, "nenhum aparelho com cliente na simulação");
    const res = search(sold!.customer!);
    expect(res.some((r) => r.id === sold!.id), "não encontrou pelo nome do cliente");
    return `“${sold!.customer}”: ${res.length} aparelho(s)`;
  });

  // ── Vendas ──
  const sell = async (method: string, extra: Record<string, unknown> = {}) => {
    const d = await newDevice();
    const parsed = saleSchema.parse({
      action: "CONCLUIR",
      customerId: customer.id,
      items: [{ kind: "DEVICE", deviceId: d.id, discount: 10000 }],
      payments: [{ method, amount: 390000, installments: method === "CREDITO_PARCELADO" ? 10 : 1, accountId: method === "DEBITO" || method.startsWith("CREDITO") ? (maq?.id ?? null) : null }],
      ...extra,
    });
    const sale = await tx((x) => saveSale(x, parsed, actor));
    const dev = await sim.device.findUniqueOrThrow({ where: { id: d.id } });
    expect(dev.status === "VENDIDO", "aparelho não deu baixa");
    const entries = await sim.financialEntry.count({ where: { originType: "VENDA", originId: sale.id } });
    expect(entries > 0, "sem lançamento no financeiro");
    return { sale, entries, deviceId: d.id };
  };
  const labels: Record<string, string> = { DINHEIRO: "Dinheiro", PIX: "Pix", DEBITO: "Débito", CREDITO: "Crédito à vista", CREDITO_PARCELADO: "Crédito parcelado (10x)" };
  let firstSaleId = "";
  for (const m of Object.keys(labels)) {
    await t("Vendas", `Vender com ${labels[m]}`, async () => {
      const r = await sell(m);
      if (!firstSaleId) firstSaleId = r.sale.id;
      return `Venda #${r.sale.number} com desconto de R$ 100,00: baixa no estoque e ${r.entries} lançamento(s) no financeiro`;
    });
  }
  await t("Vendas", "Venda com troca de usado", async () => {
    const old = models[models.length - 1];
    const tradeImei = makeImei(`35${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`, seq++);
    const r = await sell("PIX", {
      payments: [{ method: "PIX", amount: 240000 }],
      tradeIns: [{ key: "t", imei: tradeImei, modelId: old.id, capacity: (JSON.parse(old.capacities) as string[])[0], color: (JSON.parse(old.colors) as string[])[0], batteryHealth: 85, grade: "B", checklist: Object.fromEntries(TRADE_IN_CHECKLIST.map((c) => [c.key, true])), suggestedValue: 150000, finalValue: 150000 }],
    });
    const used = await sim.device.findUnique({ where: { imei: tradeImei } });
    expect(used && used.origin === "TROCA", "usado não entrou no estoque");
    return `Venda #${r.sale.number}: ${old.name} recebido por R$ 1.500,00 entrou no estoque (${used!.status === "DISPONIVEL" ? "disponível" : "em avaliação"})`;
  });
  await t("Vendas", "Cancelar venda e devolver ao estoque", async () => {
    const r = await sell("PIX");
    await tx((x) => cancelSale(x, { id: r.sale.id, type: "DEVOLUCAO", reason: "Teste do app" }, actor));
    const dev = await sim.device.findUniqueOrThrow({ where: { id: r.deviceId } });
    const w = await sim.warranty.findFirst({ where: { saleId: r.sale.id } });
    expect(dev.status === "DISPONIVEL", `aparelho ficou ${dev.status}`);
    expect(w?.status === "CANCELADA", "garantia continuou ativa");
    const refund = await sim.financialEntry.count({ where: { originType: "ESTORNO" } });
    expect(refund > 0, "sem estorno no financeiro");
    return "Aparelho voltou para “Em estoque”, garantia cancelada e estorno lançado";
  });

  // ── Ordens de serviço ──
  const newSo = (over: Record<string, unknown> = {}) =>
    tx((x) => createServiceOrder(x, soCreateSchema.parse({ kind: "CLIENTE", customerId: customer.id, modelId: mA.id, color: colA, problem: "Troca de tela (teste)", services: "Troca de tela", price: 80000, laborCost: 10000, priority: "NORMAL", ...over }), user.id));
  await t("OS", "Passar uma OS por todos os status", async () => {
    const so = await newSo({ dueDate: new Date(now.getTime() + 3 * DAY).toISOString() });
    for (const s of ["DIAGNOSTICO", "AGUARDANDO_PECA", "EM_REPARO", "PRONTA"]) await tx((x) => moveServiceOrder(x, { id: so.id, status: s, index: 0 }, user.id));
    await tx((x) => deliverServiceOrder(x, { id: so.id, method: "PIX" }, user.id));
    const after = await sim.serviceOrder.findUniqueOrThrow({ where: { id: so.id }, include: { warranty: true } });
    const fin = await sim.financialEntry.findFirst({ where: { originType: "OS", originId: so.id } });
    expect(after.status === "ENTREGUE" && after.deliveredAt, "não ficou entregue");
    expect(fin?.amount === 80000, "cobrança não entrou no financeiro");
    expect(after.warranty, "garantia do serviço não foi gerada");
    return `OS #${so.number}: Aberta → Em análise → Aguardando peça → Em reparo → Pronta → Entregue; R$ 800,00 no financeiro e garantia #${after.warranty!.number}`;
  });
  await t("OS", "OS atrasada aparece no painel", async () => {
    const before = (await getDashboard({ ...actor, name: user.name, email: "" })).serviceOrders.late;
    await newSo({ dueDate: new Date(now.getTime() - 2 * DAY).toISOString() });
    const after = (await getDashboard({ ...actor, name: user.name, email: "" })).serviceOrders.late;
    expect(after === before + 1, `atrasadas ${before} → ${after}`);
    return `OS com prazo vencido contada como atrasada (${before} → ${after})`;
  });
  await t("OS", "Cancelar OS", async () => {
    const so = await newSo();
    await tx((x) => cancelServiceOrder(x, { id: so.id, reason: "Teste do app" }, user.id));
    expect((await sim.serviceOrder.findUniqueOrThrow({ where: { id: so.id } })).status === "CANCELADA", "não cancelou");
    return `OS #${so.number} cancelada`;
  });

  // ── Encomendas ──
  const mkOrder = (deposit: number) =>
    tx((x) => saveOrder(x, orderSchema.parse({ customerId: customer.id, modelId: mA.id, capacity: capA, color: colA, condition: "NOVO", agreedPrice: 500000, deposit, depositMethod: deposit ? "PIX" : null }), user.id));
  await t("Encomendas", "Do pedido até virar venda", async () => {
    const o = await mkOrder(50000);
    await tx((x) => setOrderStatus(x, o.id, "EM_BUSCA", user.id));
    const d = await tx((x) => registerArrival(x, { orderId: o.id, imei: makeImei(tac, seq++), capacity: capA, color: colA, condition: "NOVO", batteryHealth: null, acquisitionCost: 420000, salePrice: 500000 }, user.id));
    const reserved = await sim.device.findUniqueOrThrow({ where: { id: d.id } });
    expect(reserved.status === "RESERVADO" && reserved.reservedCustomerId === customer.id, "aparelho não ficou reservado ao cliente");
    const sale = await tx((x) => deliverOrder(x, { orderId: o.id, method: "PIX", installments: 1 }, actor));
    const after = await sim.order.findUniqueOrThrow({ where: { id: o.id } });
    const pays = await sim.salePayment.findMany({ where: { saleId: sale.id } });
    expect(after.status === "ENTREGUE", "encomenda não ficou entregue");
    expect(pays.some((p) => p.method === "SINAL" && p.amount === 50000) && pays.some((p) => p.method === "PIX" && p.amount === 450000), "sinal não foi abatido");
    return `Encomenda #${o.number}: Pendente → Encomendado → Chegou (reservado ao cliente) → venda #${sale.number} (sinal R$ 500,00 + Pix R$ 4.500,00)`;
  });
  await t("Encomendas", "Encomenda cancelada com devolução do sinal", async () => {
    const o = await mkOrder(30000);
    await tx((x) => cancelOrder(x, { id: o.id, reason: "Teste do app", refund: true }, user.id));
    const refund = await sim.financialEntry.findFirst({ where: { originType: "ENCOMENDA", originId: o.id, type: "PAGAR" } });
    expect((await sim.order.findUniqueOrThrow({ where: { id: o.id } })).status === "CANCELADA", "não cancelou");
    expect(refund?.amount === 30000, "devolução do sinal não lançada");
    return "Cancelada e devolução de R$ 300,00 lançada no financeiro";
  });

  // ── Garantias ──
  const w = firstSaleId ? await sim.warranty.findFirst({ where: { saleId: firstSaleId } }) : null;
  await t("Garantias", "Gerada automaticamente na venda e na OS", async () => {
    expect(w, "venda não gerou garantia");
    const days = Math.round((w!.endDate.getTime() - w!.startDate.getTime()) / DAY);
    const so = await sim.warranty.count({ where: { kind: "OS" } });
    expect(so > 0, "nenhuma garantia de OS");
    return `Venda: garantia #${w!.number} de ${days} dias; ${so} garantia(s) de serviço`;
  });
  await t("Garantias", "Acionar e aprovar (OS Garantia com valor zero)", async () => {
    const c = await tx((x) => claimWarranty(x, { warrantyId: w!.id, problem: "Não liga (teste)" }, user.id));
    const so = await tx((x) => approveClaim(x, { claimId: c.id, note: "Defeito confirmado" }, user.id));
    expect(so.kind === "GARANTIA" && so.price === 0, "OS de garantia incorreta");
    await tx((x) => deliverServiceOrder(x, { id: so.id }, user.id));
    const after = await sim.warrantyClaim.findUniqueOrThrow({ where: { id: c.id } });
    const fin = await sim.financialEntry.count({ where: { originType: "OS", originId: so.id } });
    expect(after.status === "CONCLUIDO" && fin === 0, "acionamento não concluiu ou gerou cobrança");
    return `Acionamento #${c.number} → OS #${so.number} (Garantia, R$ 0,00) entregue → concluído, sem cobrança`;
  });
  await t("Garantias", "Negar acionamento (mau uso) com motivo", async () => {
    const other = await sell("PIX");
    const ow = await sim.warranty.findFirstOrThrow({ where: { saleId: other.sale.id } });
    const c = await tx((x) => claimWarranty(x, { warrantyId: ow.id, problem: "Tela quebrada (teste)" }, user.id));
    await tx((x) => denyClaim(x, { claimId: c.id, reason: "Mau uso: queda" }, user.id));
    const after = await sim.warrantyClaim.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.status === "NEGADO" && after.decisionNote === "Mau uso: queda", "negativa não registrada");
    return "Negado com motivo “Mau uso: queda” registrado";
  });
  await t("Garantias", "Garantia vencida não pode ser acionada", async () => {
    const old = await sim.warranty.create({ data: { number: 999000 + (seq % 1000), kind: "VENDA", description: "Teste vencida", startDate: new Date(now.getTime() - 100 * DAY), endDate: new Date(now.getTime() - DAY) } });
    const err = await tx((x) => claimWarranty(x, { warrantyId: old.id, problem: "x teste" }, user.id)).then(() => null, (e: Error) => e.message);
    expect(err && /vencida/.test(err), "aceitou garantia vencida");
    return `“${err}”`;
  });

  // ── Painel × soma dos registros ──
  const dash = await getDashboard({ ...actor, name: user.name, email: "" });
  const z = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const monthStart = new Date(`${z.slice(0, 8)}01T00:00:00-03:00`);
  const monthSales = await sim.sale.findMany({ where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: monthStart } } });
  const monthSvc = await sim.serviceOrder.findMany({ where: { deletedAt: null, kind: "CLIENTE", status: "ENTREGUE", deliveredAt: { gte: monthStart } }, include: { parts: true } });
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  await t("Painel", "Faturamento de vendas = soma das vendas do mês", async () => {
    const s = sum(monthSales.map((x) => x.total));
    expect(dash.kpis.month.revenue === s, `painel ${dash.kpis.month.revenue} × soma ${s}`);
    return `R$ ${(s / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${monthSales.length} vendas`;
  });
  await t("Painel", "Faturamento de serviços = soma das OS entregues", async () => {
    const s = sum(monthSvc.map((x) => x.price));
    expect(dash.kpis.month.servicesRevenue === s, `painel ${dash.kpis.month.servicesRevenue} × soma ${s}`);
    return `R$ ${(s / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${monthSvc.length} OS`;
  });
  await t("Painel", "Lucro = vendas + serviços − custos", async () => {
    const s = sum(monthSales.map((x) => x.total - x.cost - x.cardFees - x.commission)) + sum(monthSvc.map((o) => o.price - o.laborCost - sum(o.parts.map((p) => p.quantity * p.unitCost))));
    expect(dash.kpis.month.profit === s, `painel ${dash.kpis.month.profit} × soma ${s}`);
    return "Confere";
  });
  await t("Painel", "Ticket médio", async () => {
    const s = monthSales.length ? Math.round(sum(monthSales.map((x) => x.total)) / monthSales.length) : 0;
    expect(dash.kpis.month.ticket === s, `painel ${dash.kpis.month.ticket} × cálculo ${s}`);
    return "Confere";
  });
  await t("Painel", "Sinais recebidos de encomendas", async () => {
    const s = sum((await sim.financialEntry.findMany({ where: { deletedAt: null, status: { not: "CANCELADA" }, originType: "ENCOMENDA", type: "RECEBER", createdAt: { gte: monthStart } } })).map((e) => e.amount));
    expect(dash.kpis.month.deposits === s, `painel ${dash.kpis.month.deposits} × soma ${s}`);
    return "Confere";
  });
  await t("Painel", "OS abertas e atrasadas", async () => {
    const open = await sim.serviceOrder.count({ where: { deletedAt: null, status: { notIn: ["ENTREGUE", "CANCELADA"] } } });
    const today = new Date(`${z}T00:00:00-03:00`);
    const late = await sim.serviceOrder.count({ where: { deletedAt: null, status: { notIn: ["ENTREGUE", "CANCELADA"] }, dueDate: { lt: today } } });
    const dashOpen = Object.values(dash.serviceOrders.byStatus).reduce((a, b) => a + b, 0);
    expect(dashOpen === open && dash.serviceOrders.late === late, `painel ${dashOpen}/${dash.serviceOrders.late} × contagem ${open}/${late}`);
    return `${open} abertas, ${late} atrasadas`;
  });
  await t("Painel", "Garantias vencendo em 7 dias", async () => {
    const n = await sim.warranty.count({ where: { status: "ATIVA", endDate: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } } });
    expect(Math.abs(dash.warrantiesExpiring - n) <= 0, `painel ${dash.warrantiesExpiring} × contagem ${n}`);
    return `${n} garantia(s)`;
  });
  await t("Painel", "Estoque parado e modelos mais vendidos", async () => {
    expect(dash.topModels.length > 0, "sem modelos mais vendidos");
    const staleLimit = new Date(now.getTime() - dash.stock.staleDays * DAY);
    const stale = await sim.device.count({ where: { deletedAt: null, status: "DISPONIVEL", entryDate: { lt: staleLimit } } });
    expect(dash.stock.stale === stale, `painel ${dash.stock.stale} × contagem ${stale}`);
    return `${stale} parado(s) há +${dash.stock.staleDays} dias; mais vendido: ${dash.topModels[0].name}`;
  });

  // ── Simulação × dados reais ──
  await t("Simulação", "Apagar a simulação não afeta os dados reais", async () => {
    await deleteSimulation();
    expect(!fs.existsSync(SIM_DB_FILE), "arquivo da simulação continua existindo");
    expect(!isSimulation(), "modo simulação continua ligado");
    const realAfter = await fingerprint(realDb);
    expect(realAfter.hash === realBefore.hash, `dados reais mudaram: ${JSON.stringify(realBefore.counts)} → ${JSON.stringify(realAfter.counts)}`);
    return `Banco real idêntico antes e depois (${realAfter.counts.device} aparelho(s), ${realAfter.counts.sale} venda(s) reais)`;
  });

  // simulação nova e limpa (sem os registros de teste) para você explorar
  const fresh = await generateSimulation(user);
  const report: TestReport = { startedAt, finishedAt: new Date().toISOString(), ok: items.filter((i) => i.ok).length, failed: items.filter((i) => !i.ok).length, items, meta: fresh };
  void meta;
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  return report;
}
