import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { receivePurchase, savePurchase, placePurchase, buyUsedDevice, cancelPurchase } from "@/features/purchases/service";
import { emptyChecklistForTests, nextImei, testModel, testUser } from "./helpers";

async function setup() {
  const [user, model] = await Promise.all([testUser("GERENTE"), testModel()]);
  const supplier = await db.supplier.create({ data: { name: `Fornecedor ${Date.now()}`, kind: "PJ" } });
  const acc = await db.accessory.create({ data: { sku: `P-${Date.now()}-${Math.random()}`, name: "Cabo teste", category: "CABO", quantity: 0, cost: 0, price: 5000 } });
  const p = await db.$transaction((tx) =>
    savePurchase(
      tx,
      {
        supplierId: supplier.id,
        expectedAt: null,
        dueDate: null,
        notes: null,
        items: [
          { kind: "DEVICE", modelId: model.id, capacity: "128GB", color: "Preto", condition: "SEMINOVO", accessoryId: null, quantity: 3, unitCost: 250000, salePrice: 350000 },
          { kind: "ACCESSORY", modelId: null, capacity: null, color: null, condition: null, accessoryId: acc.id, quantity: 10, unitCost: 1500, salePrice: 0 },
        ],
      },
      user.id,
    ),
  );
  const items = await db.purchaseItem.findMany({ where: { purchaseId: p.id } });
  return { user, model, supplier, acc, p, items };
}

describe("compras", () => {
  it("recebimento parcial cria aparelhos, movimenta acessórios e gera conta a pagar só do que chegou", async () => {
    const { user, p, items, acc, supplier } = await setup();
    expect(p.total).toBe(3 * 250000 + 10 * 1500);
    await db.$transaction((tx) => placePurchase(tx, p.id, user.id));

    const dev = items.find((i) => i.kind === "DEVICE")!;
    const accItem = items.find((i) => i.kind === "ACCESSORY")!;
    const r1 = await db.$transaction((tx) =>
      receivePurchase(
        tx,
        {
          purchaseId: p.id,
          dueDate: null,
          paid: false,
          accountId: null,
          items: [
            { itemId: dev.id, quantity: 0, devices: [{ imei: nextImei(), imei2: null, serial: null, color: null, batteryHealth: 88, grade: "A" }] },
            { itemId: accItem.id, quantity: 4, devices: [] },
          ],
        },
        user.id,
      ),
    );
    expect(r1.complete).toBe(false);
    expect(r1.receivedValue).toBe(250000 + 4 * 1500);

    const po = await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } });
    expect(po.status).toBe("RECEBIDO_PARCIAL");
    const devices = await db.device.findMany({ where: { purchaseItemId: dev.id } });
    expect(devices).toHaveLength(1);
    expect(devices[0].acquisitionCost).toBe(250000);
    expect(devices[0].supplierId).toBe(supplier.id);
    expect(devices[0].origin).toBe("COMPRA");
    expect((await db.accessory.findUniqueOrThrow({ where: { id: acc.id } })).quantity).toBe(4);

    const entries = await db.financialEntry.findMany({ where: { originType: "COMPRA", originId: p.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("PAGAR");
    expect(entries[0].amount).toBe(256000);

    // não pode receber mais do que falta
    await expect(
      db.$transaction((tx) => receivePurchase(tx, { purchaseId: p.id, dueDate: null, paid: false, accountId: null, items: [{ itemId: accItem.id, quantity: 7, devices: [] }] }, user.id)),
    ).rejects.toThrow(/faltam 6/);

    // completa o pedido
    const r2 = await db.$transaction((tx) =>
      receivePurchase(
        tx,
        {
          purchaseId: p.id,
          dueDate: null,
          paid: true,
          accountId: null,
          items: [
            { itemId: dev.id, quantity: 0, devices: [nextImei(), nextImei()].map((imei) => ({ imei, imei2: null, serial: null, color: null, batteryHealth: null, grade: null })) },
            { itemId: accItem.id, quantity: 6, devices: [] },
          ],
        },
        user.id,
      ),
    );
    expect(r2.complete).toBe(true);
    expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("RECEBIDO");
    expect(await db.financialEntry.count({ where: { originType: "COMPRA", originId: p.id, status: "PAGA" } })).toBe(1);
    // pedido com recebimento não pode ser cancelado
    await expect(db.$transaction((tx) => cancelPurchase(tx, p.id, "teste", user.id))).rejects.toThrow(/recebidos/);
  });

  it("compra de pessoa física entra no estoque com custo = valor pago e lança a saída", async () => {
    const [user, model] = await Promise.all([testUser("GERENTE"), testModel()]);
    const customer = await db.customer.create({ data: { name: "Vendedor PF", cpf: `${Date.now()}`.slice(-11) } });
    const imei = nextImei();
    const r = await db.$transaction((tx) =>
      buyUsedDevice(
        tx,
        { customerId: customer.id, imei, imei2: null, serial: null, modelId: model.id, capacity: "128GB", color: "Preto", batteryHealth: 85, grade: "B", checklist: emptyChecklistForTests(), photos: [], notes: null, value: 180000, salePrice: 260000, paymentMethod: "PIX", accountId: null },
        user.id,
      ),
    );
    expect(r.device.origin).toBe("COMPRA_PF");
    expect(r.device.acquisitionCost).toBe(180000);
    const e = await db.financialEntry.findFirst({ where: { originType: "COMPRA", originId: r.purchase.id } });
    expect(e?.status).toBe("PAGA");
    expect(e?.amount).toBe(180000);
  });

  it("recusa compra de aparelho com iCloud vinculado", async () => {
    const [user, model] = await Promise.all([testUser("GERENTE"), testModel()]);
    const customer = await db.customer.create({ data: { name: "Vendedor PF 2" } });
    await expect(
      db.$transaction((tx) =>
        buyUsedDevice(
          tx,
          { customerId: customer.id, imei: nextImei(), imei2: null, serial: null, modelId: model.id, capacity: "128GB", color: "Preto", batteryHealth: null, grade: null, checklist: { ...emptyChecklistForTests(), icloud: false }, photos: [], notes: null, value: 100000, salePrice: 0, paymentMethod: "DINHEIRO", accountId: null },
          user.id,
        ),
      ),
    ).rejects.toThrow(/iCloud/);
  });
});
