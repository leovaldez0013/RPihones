import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeImei } from "@/domain/imei";
import { createDevice } from "@/features/devices/service";
import { mockProvider, mockReport, normalizeReport, resolveProvider, noneProvider } from "@/features/imei/providers";
import { checkImei, verdict } from "@/features/imei/service";
import { saveSale } from "@/features/sales/service";
import { saleSchema } from "@/features/sales/schemas";
import { DEFAULT_CATEGORIES } from "@/features/finance/categories";
import { deviceData, testModel, testUser } from "./helpers";

const RUN = Math.floor(Math.random() * 1e5);
/** IMEI válido cujo 14º dígito é `d` (regra do provedor de demonstração). */
function imeiWith14th(d: number, seed: number) {
  for (let s = seed; ; s++) {
    const imei = makeImei("35888888", s);
    if (imei.charAt(13) === String(d)) return imei;
  }
}

beforeAll(async () => {
  for (const c of DEFAULT_CATEGORIES) await db.category.upsert({ where: { key: c.key }, update: {}, create: { ...c, system: true } });
  await db.storeSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
});

describe("teste de IMEI", () => {
  it("normaliza respostas de APIs com nomes de campo diferentes", () => {
    expect(normalizeReport({ result: { blacklistStatus: "Blacklisted", FMI: "ON", carrier: "Vivo", Model: "iPhone 13" } })).toMatchObject({
      blacklisted: true,
      findMyOn: true,
      carrier: "Vivo",
      model: "iPhone 13",
    });
    expect(normalizeReport({ data: { blacklisted: false, icloudLock: "OFF" } })).toMatchObject({ blacklisted: false, findMyOn: false });
    expect(normalizeReport("x").blacklisted).toBeNull();
  });

  it("veredito e provedor de demonstração determinístico", () => {
    expect(verdict({ blacklisted: true, findMyOn: false })).toBe("BLOQUEADO");
    expect(verdict({ blacklisted: false, findMyOn: true })).toBe("ATENCAO");
    expect(verdict({ blacklisted: false, findMyOn: false })).toBe("LIVRE");
    expect(verdict({ blacklisted: null, findMyOn: null })).toBe("LOCAL");
    expect(mockReport(imeiWith14th(9, 1)).blacklisted).toBe(true);
    expect(mockReport(imeiWith14th(8, 1)).findMyOn).toBe(true);
    expect(resolveProvider({ provider: "none" })).toBe(noneProvider);
    expect(() => resolveProvider({ provider: "http", apiUrl: null })).toThrow(/endereço/);
  });

  it("rejeita IMEI com dígito verificador inválido", async () => {
    const u = await testUser();
    const valid = makeImei("35888888", 4242);
    const wrong = valid.slice(0, 14) + String((Number(valid[14]) + 1) % 10);
    await expect(checkImei(db, { imei: wrong }, u.id, mockProvider)).rejects.toThrow(/verificador/);
  });

  it("bloqueado: grava no histórico do aparelho, notifica e impede a venda", async () => {
    const u = await testUser();
    const model = await testModel();
    const imei = imeiWith14th(9, 100000 + RUN);
    const device = await db.$transaction((tx) => createDevice(tx, deviceData(model.id, { imei }), { userId: u.id }));

    const r = await checkImei(db, { imei }, u.id, mockProvider);
    expect(r.verdict).toBe("BLOQUEADO");
    expect(r.device?.id).toBe(device.id);
    expect(await db.deviceEvent.count({ where: { deviceId: device.id, type: "IMEI_CHECK" } })).toBe(1);
    expect(await db.notification.count({ where: { type: "IMEI_BLOCKED", title: { contains: imei } } })).toBe(1);

    await expect(
      db.$transaction((tx) =>
        saveSale(tx, saleSchema.parse({ action: "CONCLUIR", items: [{ kind: "DEVICE", deviceId: device.id, discount: 0 }], payments: [{ method: "PIX", amount: device.salePrice }] }), { id: u.id, role: "ADMIN" }),
      ),
    ).rejects.toThrow(/BLOQUEADO/);
  });

  it("troca com IMEI bloqueado é recusada", async () => {
    const u = await testUser();
    const model = await testModel();
    const device = await db.$transaction((tx) => createDevice(tx, deviceData(model.id), { userId: u.id }));
    const customer = await db.customer.create({ data: { name: "Cliente troca bloqueada" } });
    const tradeImei = imeiWith14th(9, 300000 + RUN);
    await checkImei(db, { imei: tradeImei }, u.id, mockProvider);
    const checklist = Object.fromEntries(["tela"].map((k) => [k, true]));
    await expect(
      db.$transaction((tx) =>
        saveSale(
          tx,
          saleSchema.parse({
            action: "CONCLUIR",
            customerId: customer.id,
            items: [{ kind: "DEVICE", deviceId: device.id, discount: 0 }],
            tradeIns: [{ key: "t", imei: tradeImei, modelId: model.id, capacity: "128GB", color: "Preto", batteryHealth: 90, grade: "A", checklist, suggestedValue: 100000, finalValue: 100000 }],
            payments: [{ method: "PIX", amount: device.salePrice - 100000 }],
          }),
          { id: u.id, role: "ADMIN" },
        ),
      ),
    ).rejects.toThrow(/BLOQUEADO/);
  });

  it("consulta feita antes do cadastro passa a constar no aparelho", async () => {
    const u = await testUser();
    const model = await testModel();
    const imei = imeiWith14th(3, 200000 + RUN);
    const r = await checkImei(db, { imei }, u.id, mockProvider);
    expect(r.device).toBeNull();
    const device = await db.$transaction((tx) => createDevice(tx, deviceData(model.id, { imei }), { userId: u.id }));
    expect(await db.imeiCheck.count({ where: { deviceId: device.id } })).toBe(1);
  });
});
