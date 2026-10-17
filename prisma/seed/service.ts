// Ordens de serviço e encomendas de demonstração, criadas pelos próprios serviços
// (mesmas regras da tela) e depois movidas para datas passadas.
import { db } from "../../src/lib/db";
import { TRADE_IN_CHECKLIST } from "../../src/domain/constants";
import { soCreateSchema } from "../../src/features/service-orders/schemas";
import { addPart, createServiceOrder, deliverServiceOrder, moveServiceOrder } from "../../src/features/service-orders/service";
import { orderSchema } from "../../src/features/orders/schemas";
import { cancelOrder, reserveForOrder, saveOrder, setOrderStatus } from "../../src/features/orders/service";
import { addDays, chance, daysAgo, int, pick } from "./util";

const DAY = 86400000;
const okChecklist = () => Object.fromEntries(TRADE_IN_CHECKLIST.map((c) => [c.key, true]));

/** Desloca os registros gerados por uma OS feita "agora" para `when` (abertura) e `done` (entrega). */
async function moveSoTo(id: string, when: Date, done: Date | null) {
  const so = await db.serviceOrder.findUniqueOrThrow({ where: { id } });
  const shiftTo = (d: Date) => (done && Math.abs(d.getTime() - (so.deliveredAt ?? d).getTime()) < 60000 ? done : when);
  await db.serviceOrder.update({ where: { id }, data: { createdAt: when, deliveredAt: done, dueDate: so.dueDate ?? addDays(when, 3) } });
  const today = new Date();
  for (const e of await db.financialEntry.findMany({ where: { originType: "OS", originId: id } })) {
    const offset = e.dueDate.getTime() - e.createdAt.getTime();
    const base = done ?? when;
    const due = new Date(base.getTime() + offset);
    const settled = e.status === "PAGA" || (e.method && due < today);
    await db.financialEntry.update({ where: { id: e.id }, data: { createdAt: base, dueDate: due, status: settled ? "PAGA" : e.status, paidAt: settled ? (e.paidAt ? base : due) : null } });
  }
  for (const d of await db.document.findMany({ where: { serviceOrderId: id } })) {
    await db.document.update({ where: { id: d.id }, data: { createdAt: d.type === "OS_ENTREGA" && done ? done : when } });
  }
  for (const ev of await db.deviceEvent.findMany({ where: { refType: "OS", refId: id } })) {
    await db.deviceEvent.update({ where: { id: ev.id }, data: { createdAt: shiftTo(ev.createdAt) } });
  }
  for (const m of await db.stockMovement.findMany({ where: { refType: "OS", refId: id } })) {
    await db.stockMovement.update({ where: { id: m.id }, data: { createdAt: addDays(when, 1) } });
  }
}

const CLIENT_JOBS = [
  { device: "iPhone 11 64GB preto", problem: "Bateria viciando, desliga com 20%", part: "PCA-BAT-11", price: 29000, labor: 4000 },
  { device: "iPhone 12 128GB azul", problem: "Tela trincada após queda", part: "PCA-TEL-12", price: 89000, labor: 8000 },
  { device: "iPhone 12 Pro 256GB grafite", problem: "Bateria com 74% de saúde", part: "PCA-BAT-12", price: 32000, labor: 4000 },
  { device: "iPhone 13 128GB meia-noite", problem: "Troca de bateria", part: "PCA-BAT-13", price: 35000, labor: 4000 },
  { device: "iPhone 11 128GB branco", problem: "Não carrega — conector oxidado", part: "PCA-CON-LIG", price: 22000, labor: 6000 },
  { device: "iPhone 13 256GB estelar", problem: "Tela com manchas e touch falhando", part: "PCA-TEL-13", price: 109000, labor: 8000 },
  { device: "iPhone 14 Pro 128GB roxo-profundo", problem: "Bateria inchada", part: "PCA-BAT-14P", price: 45000, labor: 5000 },
  { device: "iPhone XR 64GB vermelho", problem: "Limpeza de alto-falante e microfone", part: null, price: 12000, labor: 3000 },
];

export async function seedServiceOrders(users: { tecnico: string; vendedor1: string; gerente: string }, customerIds: string[]) {
  const parts = Object.fromEntries((await db.accessory.findMany({ where: { isPart: true } })).map((a) => [a.sku, a.id]));
  const methods = ["PIX", "PIX", "DEBITO", "CREDITO", "A_RECEBER"] as const;
  let count = 0;

  // histórico: OS de clientes nos últimos 6 meses (repõe as peças antes de usar)
  for (let i = 0; i < 18; i++) {
    const job = pick(CLIENT_JOBS);
    const when = daysAgo(int(4, 175), int(9, 17));
    const done = new Date(Math.min(when.getTime() + int(1, 4) * DAY, Date.now() - DAY));
    if (job.part) await db.accessory.update({ where: { id: parts[job.part] }, data: { quantity: { increment: 1 } } });
    const so = await db.$transaction((tx) =>
      createServiceOrder(tx, soCreateSchema.parse({ kind: "CLIENTE", customerId: pick(customerIds), deviceDescription: job.device, problem: job.problem, price: job.price, laborCost: job.labor, technicianId: users.tecnico, priority: "NORMAL", checklist: okChecklist() }), users.vendedor1),
    );
    if (job.part) await db.$transaction((tx) => addPart(tx, { serviceOrderId: so.id, accessoryId: parts[job.part!], quantity: 1, unitPrice: 0 }, users.tecnico));
    const method = pick(methods);
    await db.$transaction((tx) => deliverServiceOrder(tx, { id: so.id, method }, users.vendedor1));
    await moveSoTo(so.id, when, done);
    count++;
  }

  // histórico: preparação interna de seminovos do estoque (custo soma ao aparelho)
  const trades = await db.device.findMany({ where: { condition: "SEMINOVO", status: "DISPONIVEL", deletedAt: null }, include: { model: true }, orderBy: { entryDate: "desc" }, take: 10 });
  for (const d of trades) {
    const bat = Object.keys(parts).find((sku) => sku.startsWith("PCA-BAT") && d.model.name.startsWith(`iPhone ${sku.slice(8, 10)}`));
    const so = await db.$transaction((tx) =>
      createServiceOrder(tx, soCreateSchema.parse({ kind: "INTERNA", deviceId: d.id, problem: bat ? "Troca de bateria e higienização" : "Higienização e película", laborCost: bat ? 4000 : 1500, technicianId: users.tecnico, priority: "NORMAL" }), users.gerente),
    );
    if (bat && chance(0.8)) {
      await db.accessory.update({ where: { id: parts[bat] }, data: { quantity: { increment: 1 } } });
      await db.$transaction((tx) => addPart(tx, { serviceOrderId: so.id, accessoryId: parts[bat], quantity: 1, unitPrice: 0 }, users.tecnico));
    }
    await db.$transaction((tx) => deliverServiceOrder(tx, { id: so.id }, users.tecnico));
    const when = new Date(d.entryDate.getTime() + DAY);
    await moveSoTo(so.id, when, new Date(Math.min(when.getTime() + 2 * DAY, Date.now() - 3600000)));
    count++;
  }

  // quadro atual: OS abertas em várias colunas
  const board: { status: string; priority: string }[] = [
    { status: "ABERTA", priority: "NORMAL" },
    { status: "ABERTA", priority: "URGENTE" },
    { status: "DIAGNOSTICO", priority: "NORMAL" },
    { status: "AGUARDANDO_PECA", priority: "ALTA" },
    { status: "EM_REPARO", priority: "NORMAL" },
    { status: "EM_REPARO", priority: "ALTA" },
    { status: "PRONTA", priority: "NORMAL" },
  ];
  for (const [i, b] of board.entries()) {
    const job = CLIENT_JOBS[i % CLIENT_JOBS.length];
    const when = daysAgo(int(0, 4), int(9, 17));
    const so = await db.$transaction((tx) =>
      createServiceOrder(
        tx,
        soCreateSchema.parse({ kind: "CLIENTE", customerId: pick(customerIds), deviceDescription: job.device, problem: job.problem, price: job.price, laborCost: job.labor, technicianId: i % 3 === 2 ? null : users.tecnico, priority: b.priority, dueDate: addDays(when, int(1, 5)), checklist: okChecklist() }),
        users.vendedor1,
      ),
    );
    if (b.status !== "ABERTA") await db.$transaction((tx) => moveServiceOrder(tx, { id: so.id, status: b.status, index: 99 }, users.tecnico));
    await moveSoTo(so.id, when, null);
    count++;
  }
  // aparelhos de troca ainda em preparação
  const evaluating = await db.device.findMany({ where: { status: { in: ["EM_AVALIACAO", "DISPONIVEL"] }, origin: "TROCA", deletedAt: null, serviceOrders: { none: {} } }, take: 3 });
  for (const [i, d] of evaluating.entries()) {
    const so = await db.$transaction((tx) =>
      createServiceOrder(tx, soCreateSchema.parse({ kind: "INTERNA", deviceId: d.id, problem: pick(["Revisão geral e película", "Trocar bateria (saúde baixa)", "Polimento da carcaça"]), laborCost: 2000, technicianId: users.tecnico, priority: "NORMAL" }), users.gerente),
    );
    if (i > 0) await db.$transaction((tx) => moveServiceOrder(tx, { id: so.id, status: i === 1 ? "DIAGNOSTICO" : "EM_REPARO", index: 99 }, users.tecnico));
    count++;
  }
  return count;
}

export async function seedOrders(users: { vendedor1: string; vendedor2: string }, customerIds: string[]) {
  const models = Object.fromEntries((await db.deviceModel.findMany()).map((m) => [m.name, m.id]));
  const wishes = [
    { model: "iPhone 16 Pro Max", capacity: "256GB", color: null, condition: "SEMINOVO", max: 780000, deposit: 50000, method: "PIX" },
    { model: "iPhone 15 Pro", capacity: "128GB", color: "Titânio natural", condition: "SEMINOVO", max: 520000, deposit: 30000, method: "PIX" },
    { model: "iPhone 13", capacity: null, color: "Rosa", condition: null, max: 300000, deposit: 0, method: null },
    { model: "iPhone 17 Pro", capacity: "512GB", color: null, condition: "NOVO", max: null, deposit: 100000, method: "CREDITO" },
    { model: "iPhone 14", capacity: "128GB", color: null, condition: "SEMINOVO", max: 330000, deposit: 0, method: null },
    { model: "iPhone 12 mini", capacity: null, color: null, condition: null, max: 200000, deposit: 20000, method: "DINHEIRO" },
  ];
  let count = 0;
  for (const [i, w] of wishes.entries()) {
    if (!models[w.model]) continue;
    const seller = i % 2 ? users.vendedor2 : users.vendedor1;
    const o = await db.$transaction((tx) =>
      saveOrder(tx, orderSchema.parse({ customerId: customerIds[(i * 7) % customerIds.length], modelId: models[w.model], capacity: w.capacity, color: w.color, condition: w.condition, maxPrice: w.max, deposit: w.deposit, depositMethod: w.method, dueDate: addDays(new Date(), int(5, 20)).toISOString().slice(0, 10) }), seller),
    );
    const when = daysAgo(int(1, 12));
    await db.order.update({ where: { id: o.id }, data: { createdAt: when } });
    await db.financialEntry.updateMany({ where: { originType: "ENCOMENDA", originId: o.id }, data: { createdAt: when } });
    await db.document.updateMany({ where: { orderId: o.id }, data: { createdAt: when } });
    if (i === 1 || i === 4) await db.$transaction((tx) => setOrderStatus(tx, o.id, "EM_BUSCA", seller));
    count++;
  }
  // encomenda que já "chegou": aparelho compatível reservado para o cliente
  const ready = await db.device.findFirst({ where: { condition: "SEMINOVO", status: "DISPONIVEL", deletedAt: null, serviceOrders: { none: {} } }, orderBy: { salePrice: "desc" } });
  if (ready) {
    const o = await db.$transaction((tx) =>
      saveOrder(tx, orderSchema.parse({ customerId: customerIds[11], modelId: ready.modelId, capacity: ready.capacity, condition: "SEMINOVO", maxPrice: ready.salePrice + 20000, deposit: 30000, depositMethod: "PIX" }), users.vendedor1),
    );
    await db.$transaction((tx) => reserveForOrder(tx, o.id, ready.id, users.vendedor1));
    count++;
  }
  // uma cancelada com sinal devolvido
  const c = await db.$transaction((tx) =>
    saveOrder(tx, orderSchema.parse({ customerId: customerIds[3], modelId: models["iPhone 15"] ?? Object.values(models)[0], capacity: "256GB", deposit: 20000, depositMethod: "PIX" }), users.vendedor1),
  );
  await db.$transaction((tx) => cancelOrder(tx, { id: c.id, reason: "Cliente comprou em outro lugar", refund: true }, users.vendedor1));
  return count + 1;
}
