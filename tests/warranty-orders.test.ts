import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeImei } from "@/domain/imei";
import { createDevice } from "@/features/devices/service";
import { cancelSale, saveSale } from "@/features/sales/service";
import { saleSchema } from "@/features/sales/schemas";
import { deliverServiceOrder } from "@/features/service-orders/service";
import { approveClaim, claimWarranty, denyClaim, warrantyState } from "@/features/warranty/service";
import { orderSchema } from "@/features/orders/schemas";
import { deliverOrder, registerArrival, saveOrder } from "@/features/orders/service";
import { DEFAULT_CATEGORIES } from "@/features/finance/categories";
import { deviceData, testModel, testUser } from "./helpers";

const RUN = Math.floor(Math.random() * 1e5);
const DAY = 86400000;

beforeAll(async () => {
  for (const c of DEFAULT_CATEGORIES) await db.category.upsert({ where: { key: c.key }, update: {}, create: { ...c, system: true } });
  for (const kind of ["CAIXA", "BANCO"]) if (!(await db.financialAccount.findFirst({ where: { kind } }))) await db.financialAccount.create({ data: { name: kind, kind } });
  await db.storeSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
});

async function soldDevice() {
  const u = await testUser("ADMIN");
  const model = await testModel();
  const customer = await db.customer.create({ data: { name: `Cliente garantia ${RUN}` } });
  const d = await db.$transaction((tx) => createDevice(tx, deviceData(model.id, { salePrice: 300000 }), { userId: u.id }));
  const sale = await db.$transaction((tx) =>
    saveSale(tx, saleSchema.parse({ action: "CONCLUIR", customerId: customer.id, items: [{ kind: "DEVICE", deviceId: d.id }], payments: [{ method: "PIX", amount: 300000 }] }), { id: u.id, role: "ADMIN" }),
  );
  return { u, customer, d, sale };
}

describe("garantias", () => {
  it("venda gera garantia; acionar → aprovar abre OS Garantia sem cobrança → entregar conclui", async () => {
    const { u, sale } = await soldDevice();
    const w = await db.warranty.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(w.status).toBe("ATIVA");
    expect(Math.round((w.endDate.getTime() - w.startDate.getTime()) / DAY)).toBeGreaterThan(0);

    const c = await db.$transaction((tx) => claimWarranty(tx, { warrantyId: w.id, problem: "Não carrega" }, u.id));
    await expect(db.$transaction((tx) => claimWarranty(tx, { warrantyId: w.id, problem: "De novo" }, u.id))).rejects.toThrow(/andamento/);
    const so = await db.$transaction((tx) => approveClaim(tx, { claimId: c.id }, u.id));
    expect(so.kind).toBe("GARANTIA");
    expect(so.price).toBe(0);
    await db.$transaction((tx) => deliverServiceOrder(tx, { id: so.id }, u.id));
    expect((await db.warrantyClaim.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("CONCLUIDO");
    expect(await db.financialEntry.count({ where: { originType: "OS", originId: so.id } })).toBe(0);
  });

  it("negar exige motivo; garantia vencida e de venda cancelada não podem ser acionadas", async () => {
    const { u, sale } = await soldDevice();
    const w = await db.warranty.findFirstOrThrow({ where: { saleId: sale.id } });
    const c = await db.$transaction((tx) => claimWarranty(tx, { warrantyId: w.id, problem: "Tela" }, u.id));
    await expect(db.$transaction((tx) => denyClaim(tx, { claimId: c.id, reason: "" }, u.id))).rejects.toThrow(/motivo/);
    await db.$transaction((tx) => denyClaim(tx, { claimId: c.id, reason: "Mau uso" }, u.id));
    expect((await db.warrantyClaim.findUniqueOrThrow({ where: { id: c.id } })).decisionNote).toBe("Mau uso");

    expect(warrantyState({ status: "ATIVA", endDate: new Date(Date.now() - DAY) })).toBe("VENCIDA");
    expect(warrantyState({ status: "ATIVA", endDate: new Date(Date.now() + 3 * DAY) })).toBe("VENCENDO");

    await db.$transaction((tx) => cancelSale(tx, { id: sale.id, type: "DEVOLUCAO", reason: "teste" }, { id: u.id, role: "ADMIN" }));
    expect((await db.warranty.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("CANCELADA");
    await expect(db.$transaction((tx) => claimWarranty(tx, { warrantyId: w.id, problem: "x" }, u.id))).rejects.toThrow(/cancelada/);
  });
});

describe("encomendas", () => {
  it("chegada entra reservada ao cliente e a entrega vira venda abatendo o sinal", async () => {
    const u = await testUser("ADMIN");
    const model = await testModel();
    const customer = await db.customer.create({ data: { name: `Cliente encomenda ${RUN}` } });
    const o = await db.$transaction((tx) =>
      saveOrder(tx, orderSchema.parse({ customerId: customer.id, modelId: model.id, capacity: "128GB", color: "Preto", agreedPrice: 450000, deposit: 50000, depositMethod: "PIX" }), u.id),
    );
    const d = await db.$transaction((tx) =>
      registerArrival(tx, { orderId: o.id, imei: makeImei("35666666", RUN), capacity: "128GB", color: "Preto", condition: "SEMINOVO", batteryHealth: 90, acquisitionCost: 350000, salePrice: 460000 }, u.id),
    );
    const reserved = await db.device.findUniqueOrThrow({ where: { id: d.id } });
    expect(reserved.status).toBe("RESERVADO");
    expect(reserved.reservedCustomerId).toBe(customer.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("CHEGOU");

    const sale = await db.$transaction((tx) => deliverOrder(tx, { orderId: o.id, method: "PIX", installments: 1 }, { id: u.id, role: "ADMIN" }));
    expect(sale.total).toBe(450000); // valor combinado (desconto de R$ 100 sobre o preço de 4.600)
    const pays = await db.salePayment.findMany({ where: { saleId: sale.id } });
    expect(pays.find((p) => p.method === "SINAL")?.amount).toBe(50000);
    expect(pays.find((p) => p.method === "PIX")?.amount).toBe(400000);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("ENTREGUE");
    expect((await db.device.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("VENDIDO");
  });
});
