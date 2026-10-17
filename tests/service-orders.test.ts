import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createDevice } from "@/features/devices/service";
import { soCreateSchema } from "@/features/service-orders/schemas";
import { addPart, cancelServiceOrder, createServiceOrder, deliverServiceOrder, moveServiceOrder, removePart } from "@/features/service-orders/service";
import { DEFAULT_CATEGORIES } from "@/features/finance/categories";
import { reorder, soTotals } from "@/domain/service-order";
import { deviceData, testModel, testUser } from "./helpers";

const RUN = Math.floor(Math.random() * 1e6);
let n = 0;

beforeAll(async () => {
  for (const c of DEFAULT_CATEGORIES) await db.category.upsert({ where: { key: c.key }, update: {}, create: { ...c, system: true } });
  if (!(await db.financialAccount.findFirst({ where: { kind: "CAIXA" } }))) await db.financialAccount.create({ data: { name: "Caixa", kind: "CAIXA" } });
  if (!(await db.financialAccount.findFirst({ where: { kind: "BANCO" } }))) await db.financialAccount.create({ data: { name: "Banco", kind: "BANCO" } });
  await db.storeSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
});

async function part(quantity: number, cost: number) {
  n++;
  return db.accessory.create({ data: { sku: `PECA-${RUN}-${n}`, name: `Bateria teste ${n}`, category: "PECA", isPart: true, quantity, cost, price: cost * 2 } });
}

async function stockDevice(userId: string, status = "DISPONIVEL") {
  const model = await testModel();
  return db.$transaction((tx) => createDevice(tx, deviceData(model.id, { acquisitionCost: 300000, status: status as "DISPONIVEL" }), { userId }));
}

const so = (v: Record<string, unknown>) => soCreateSchema.parse({ priority: "NORMAL", ...v });

describe("ordens de serviço", () => {
  it("cálculo de custo/margem e reordenação do Kanban", () => {
    const t = soTotals({ laborCost: 5000, price: 30000, parts: [{ quantity: 2, unitCost: 4000, unitPrice: 8000 }] });
    expect(t).toMatchObject({ partsCost: 8000, partsPrice: 16000, cost: 13000, charge: 30000, margin: 17000 });
    expect(reorder(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(reorder(["a", "b"], "x", 99)).toEqual(["a", "b", "x"]);
  });

  it("OS interna: aparelho em manutenção, peças baixam do estoque e custo real soma ao aparelho", async () => {
    const tech = await testUser("TECNICO");
    const device = await stockDevice(tech.id);
    const bat = await part(5, 9000);

    const o = await db.$transaction((tx) => createServiceOrder(tx, so({ kind: "INTERNA", deviceId: device.id, problem: "Troca de bateria", laborCost: 4000 }), tech.id));
    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe("EM_MANUTENCAO");

    // não abre segunda OS para o mesmo aparelho
    await expect(db.$transaction((tx) => createServiceOrder(tx, so({ kind: "INTERNA", deviceId: device.id, problem: "Outra" }), tech.id))).rejects.toThrow(/já está na OS/);

    await db.$transaction((tx) => addPart(tx, { serviceOrderId: o.id, accessoryId: bat.id, quantity: 1, unitPrice: 0 }, tech.id));
    expect((await db.accessory.findUniqueOrThrow({ where: { id: bat.id } })).quantity).toBe(4);

    await db.$transaction((tx) => moveServiceOrder(tx, { id: o.id, status: "EM_REPARO", index: 0 }, tech.id));
    const r = await db.$transaction((tx) => deliverServiceOrder(tx, { id: o.id }, tech.id));
    expect(r.cost).toBe(13000);

    const d = await db.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(d.status).toBe("DISPONIVEL");
    expect(d.serviceCost).toBe(13000);
    expect(d.acquisitionCost + d.serviceCost).toBe(313000);
    // OS interna não gera receita
    expect(await db.financialEntry.count({ where: { originType: "OS", originId: o.id } })).toBe(0);
    await expect(db.$transaction((tx) => moveServiceOrder(tx, { id: o.id, status: "ABERTA", index: 0 }, tech.id))).rejects.toThrow(/entregue/);
  });

  it("aparelho vendido ou reservado não entra em OS interna", async () => {
    const u = await testUser();
    const device = await stockDevice(u.id);
    await db.device.update({ where: { id: device.id }, data: { status: "VENDIDO" } });
    await expect(db.$transaction((tx) => createServiceOrder(tx, so({ kind: "INTERNA", deviceId: device.id, problem: "Tela" }), u.id))).rejects.toThrow(/não pode entrar/);
  });

  it("OS de cliente: documento de entrada, cobrança no financeiro e comprovante de entrega", async () => {
    const u = await testUser("VENDEDOR");
    const customer = await db.customer.create({ data: { name: `Cliente OS ${RUN}` } });
    const tela = await part(2, 25000);
    const o = await db.$transaction((tx) =>
      createServiceOrder(tx, so({ kind: "CLIENTE", customerId: customer.id, deviceDescription: "iPhone 13 azul", problem: "Tela quebrada", price: 60000 }), u.id),
    );
    expect(await db.document.count({ where: { serviceOrderId: o.id, type: "OS_ENTRADA" } })).toBe(1);

    await db.$transaction((tx) => addPart(tx, { serviceOrderId: o.id, accessoryId: tela.id, quantity: 1, unitPrice: 45000 }, u.id));
    await db.$transaction((tx) => deliverServiceOrder(tx, { id: o.id, method: "PIX" }, u.id));

    const entries = await db.financialEntry.findMany({ where: { originType: "OS", originId: o.id }, include: { category: true } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "RECEBER", amount: 60000, status: "PAGA" });
    expect(entries[0].category?.key).toBe("SERVICO");
    expect(await db.document.count({ where: { serviceOrderId: o.id, type: "OS_ENTREGA" } })).toBe(1);
    expect((await db.serviceOrder.findUniqueOrThrow({ where: { id: o.id } })).deliveredAt).not.toBeNull();
  });

  it("estoque insuficiente bloqueia peça; remover e cancelar devolvem ao estoque", async () => {
    const u = await testUser("TECNICO");
    const device = await stockDevice(u.id);
    const p = await part(1, 5000);
    const o = await db.$transaction((tx) => createServiceOrder(tx, so({ kind: "INTERNA", deviceId: device.id, problem: "Revisão" }), u.id));

    await expect(db.$transaction((tx) => addPart(tx, { serviceOrderId: o.id, accessoryId: p.id, quantity: 2, unitPrice: 0 }, u.id))).rejects.toThrow(/insuficiente/);
    const added = await db.$transaction((tx) => addPart(tx, { serviceOrderId: o.id, accessoryId: p.id, quantity: 1, unitPrice: 0 }, u.id));
    await db.$transaction((tx) => removePart(tx, added.id, u.id));
    expect((await db.accessory.findUniqueOrThrow({ where: { id: p.id } })).quantity).toBe(1);

    await db.$transaction((tx) => addPart(tx, { serviceOrderId: o.id, accessoryId: p.id, quantity: 1, unitPrice: 0 }, u.id));
    await db.$transaction((tx) => cancelServiceOrder(tx, { id: o.id, reason: "Cliente desistiu" }, u.id));
    expect((await db.accessory.findUniqueOrThrow({ where: { id: p.id } })).quantity).toBe(1);
    const d = await db.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(d.status).toBe("DISPONIVEL");
    expect(d.serviceCost).toBe(0);
  });
});
