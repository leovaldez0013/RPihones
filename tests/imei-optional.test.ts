import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeImei, validateImei } from "@/domain/imei";
import { deviceSchema } from "@/features/devices/schemas";
import { createDevice, updateDevice } from "@/features/devices/service";
import { deviceData, testModel, testUser } from "./helpers";

const RUN = Math.floor(Math.random() * 1e5);
const tacOf = (n: number) => `3577${String((RUN * 7 + n) % 10000).padStart(4, "0")}`;

describe("IMEI opcional, validação e aprendizado do TAC", () => {
  it("valida só números com 15 dígitos e Luhn; espaços e traços colados são ignorados", () => {
    const ok = makeImei("35777777", 123);
    expect(validateImei(`${ok.slice(0, 5)} ${ok.slice(5, 10)}-${ok.slice(10)}`).luhnOk).toBe(true);
    expect(validateImei(`${ok.slice(0, 14)}A`).message).toBe("Use só números no IMEI.");
    const bad = ok.slice(0, 14) + String((Number(ok[14]) + 1) % 10);
    expect(validateImei(bad).message).toBe("IMEI inválido, confira a digitação");
    expect(deviceSchema.safeParse({ ...deviceData("m"), imei: bad }).success).toBe(false);
  });

  it("aparelho sem IMEI é aceito e pode receber o IMEI depois (aprendendo o TAC)", async () => {
    const u = await testUser();
    const model = await testModel();
    const noImei = deviceSchema.parse({ ...deviceData(model.id), imei: "" });
    expect(noImei.imei).toBeNull();
    const a = await db.$transaction((tx) => createDevice(tx, noImei, { userId: u.id }));
    const b = await db.$transaction((tx) => createDevice(tx, deviceSchema.parse({ ...deviceData(model.id), imei: "" }), { userId: u.id }));
    expect(a.imei).toBeNull();
    expect(b.imei).toBeNull(); // vários sem IMEI convivem

    const imei = makeImei(tacOf(1), 1);
    await db.$transaction((tx) => updateDevice(tx, a.id, { ...noImei, imei }, u.id));
    expect((await db.device.findUniqueOrThrow({ where: { id: a.id } })).imei).toBe(imei);
    expect((await db.tacEntry.findUniqueOrThrow({ where: { tac: tacOf(1) } })).modelId).toBe(model.id);
  });

  it("IMEI duplicado é bloqueado", async () => {
    const u = await testUser();
    const model = await testModel();
    const imei = makeImei(tacOf(2), 2);
    await db.$transaction((tx) => createDevice(tx, deviceData(model.id, { imei }), { userId: u.id }));
    await expect(db.$transaction((tx) => createDevice(tx, deviceData(model.id, { imei }), { userId: u.id }))).rejects.toThrow(/já cadastrado/);
  });

  it("divergência: TAC conhecido de outro modelo pede confirmação; confirmando, salva sem mudar a tabela", async () => {
    const u = await testUser();
    const m1 = await testModel();
    const m2 = await testModel();
    await db.$transaction((tx) => createDevice(tx, deviceData(m1.id, { imei: makeImei(tacOf(3), 1) }), { userId: u.id, checkTac: true }));
    const second = deviceData(m2.id, { imei: makeImei(tacOf(3), 2) });
    await expect(db.$transaction((tx) => createDevice(tx, second, { userId: u.id, checkTac: true }))).rejects.toMatchObject({ code: "TAC_MISMATCH", message: `Este IMEI costuma ser do ${m1.name}. Confirma?` });
    const saved = await db.$transaction((tx) => createDevice(tx, { ...second, confirmTacMismatch: true }, { userId: u.id, checkTac: true }));
    expect(saved.modelId).toBe(m2.id);
    expect((await db.tacEntry.findUniqueOrThrow({ where: { tac: tacOf(3) } })).modelId).toBe(m1.id);
  });
});
