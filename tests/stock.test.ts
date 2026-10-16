import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createDevice, updateDevice } from "@/features/devices/service";
import { moveAccessory } from "@/features/accessories/service";
import { deviceData, nextImei, testModel, testUser } from "./helpers";

describe("estoque de aparelhos", () => {
  it("impede IMEI duplicado (inclusive como IMEI 2)", async () => {
    const [user, model] = await Promise.all([testUser(), testModel()]);
    const data = deviceData(model.id);
    await db.$transaction((tx) => createDevice(tx, data, { userId: user.id }));

    await expect(db.$transaction((tx) => createDevice(tx, { ...data }, { userId: user.id }))).rejects.toThrow(/IMEI já cadastrado/);
    await expect(
      db.$transaction((tx) => createDevice(tx, deviceData(model.id, { imei: nextImei(), imei2: data.imei }), { userId: user.id })),
    ).rejects.toThrow(/IMEI já cadastrado/);
  });

  it("aprende o TAC e registra a entrada na linha do tempo", async () => {
    const [user, model] = await Promise.all([testUser(), testModel()]);
    const imei = nextImei("35777777");
    const d = await db.$transaction((tx) => createDevice(tx, deviceData(model.id, { imei }), { userId: user.id }));
    const tac = await db.tacEntry.findUnique({ where: { tac: "35777777" } });
    expect(tac?.modelId).toBe(model.id);
    const events = await db.deviceEvent.findMany({ where: { deviceId: d.id } });
    expect(events.map((e) => e.type)).toContain("ENTRADA");
  });

  it("não deixa mudar manualmente um status controlado por venda/OS", async () => {
    const [user, model] = await Promise.all([testUser(), testModel()]);
    const data = deviceData(model.id);
    const d = await db.$transaction((tx) => createDevice(tx, data, { userId: user.id }));
    await expect(db.$transaction((tx) => updateDevice(tx, d.id, { ...data, status: "VENDIDO" }, user.id))).rejects.toThrow(/controlado/);
  });

  it("registra alteração de preço no histórico e na auditoria", async () => {
    const [user, model] = await Promise.all([testUser(), testModel()]);
    const data = deviceData(model.id);
    const d = await db.$transaction((tx) => createDevice(tx, data, { userId: user.id }));
    await db.$transaction((tx) => updateDevice(tx, d.id, { ...data, salePrice: 450000 }, user.id));
    const ev = await db.deviceEvent.findFirst({ where: { deviceId: d.id, type: "PRECO" } });
    expect(ev?.description).toMatch(/4\.500,00/);
    const log = await db.auditLog.findFirst({ where: { entityId: d.id, action: "device.price_change" } });
    expect(log).not.toBeNull();
  });
});

describe("estoque de acessórios", () => {
  it("calcula custo médio ponderado e bloqueia estoque negativo", async () => {
    const acc = await db.accessory.create({ data: { sku: `T-${Date.now()}`, name: "Capa teste", category: "CAPA", quantity: 10, cost: 1000, price: 3000, minStock: 2 } });
    const after = await db.$transaction((tx) => moveAccessory(tx, { accessoryId: acc.id, type: "ENTRADA", delta: 10, unitCost: 2000 }));
    expect(after.quantity).toBe(20);
    expect(after.cost).toBe(1500);
    await expect(db.$transaction((tx) => moveAccessory(tx, { accessoryId: acc.id, type: "SAIDA", delta: -21 }))).rejects.toThrow(/insuficiente/);
  });

  it("notifica quando atinge o estoque mínimo", async () => {
    const acc = await db.accessory.create({ data: { sku: `T2-${Date.now()}`, name: "Película teste", category: "PELICULA", quantity: 3, cost: 500, price: 2000, minStock: 2 } });
    await db.$transaction((tx) => moveAccessory(tx, { accessoryId: acc.id, type: "SAIDA", delta: -1 }));
    const n = await db.notification.findFirst({ where: { title: { contains: "Película teste" } } });
    expect(n?.type).toBe("STOCK_LOW");
  });
});
