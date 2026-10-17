import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applySegment, daysUntilBirthday, type CustomerProfile } from "@/domain/marketing";
import { canMessage, generateAutoTasks, renderMessage } from "@/features/marketing/service";

const d = (s: string) => new Date(`${s}T12:00:00-03:00`);
const local = (y: number, m: number, day: number) => new Date(y, m - 1, day);

function profile(over: Partial<CustomerProfile>): CustomerProfile {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Fulano de Tal",
    phone: "11999990000",
    consent: true,
    birthDate: null,
    purchases: 1,
    totalSpent: 500000,
    lastPurchase: local(2026, 9, 1),
    firstPurchase: local(2026, 9, 1),
    models: ["iPhone 15"],
    lastDevice: "iPhone 15 128GB",
    lastDeviceDate: local(2026, 9, 1),
    warrantyUntil: null,
    boughtAccessory: false,
    ...over,
  };
}

describe("marketing", () => {
  it("dias até o aniversário, com virada de ano e 29/02", () => {
    expect(daysUntilBirthday(d("1990-10-16"), local(2026, 10, 16))).toBe(0);
    expect(daysUntilBirthday(d("1990-10-20"), local(2026, 10, 16))).toBe(4);
    expect(daysUntilBirthday(d("1990-01-02"), local(2026, 12, 30))).toBe(3);
    expect(daysUntilBirthday(d("2000-02-29"), local(2027, 2, 27))).toBe(1); // 2027 não é bissexto → 28/02
  });

  it("segmentos", () => {
    const today = local(2026, 10, 16);
    const a = profile({ name: "Ana", birthDate: d("1995-10-18") });
    const b = profile({ name: "Bia", lastPurchase: local(2025, 12, 1), lastDeviceDate: local(2025, 1, 10), totalSpent: 2000000, boughtAccessory: true, models: ["iPhone 13"] });
    const c = profile({ name: "Caio", warrantyUntil: local(2026, 10, 30), models: [] });
    const all = [a, b, c];
    expect(applySegment(all, "ANIVERSARIANTES", { param: 7, today }).map((x) => x.name)).toEqual(["Ana"]);
    expect(applySegment(all, "INATIVOS", { param: 6, today }).map((x) => x.name)).toEqual(["Bia"]);
    expect(applySegment(all, "UPGRADE", { param: 18, today }).map((x) => x.name)).toEqual(["Bia"]);
    expect(applySegment(all, "TICKET_ALTO", { param: 10000, today }).map((x) => x.name)).toEqual(["Bia"]);
    expect(applySegment(all, "GARANTIA", { param: 30, today }).map((x) => x.name)).toEqual(["Caio"]);
    expect(applySegment(all, "SEM_ACESSORIO", { today }).map((x) => x.name)).toEqual(["Ana"]);
    expect(applySegment(all, "MODELO", { model: "iPhone 13", today }).map((x) => x.name)).toEqual(["Bia"]);
  });

  it("LGPD: marketing só com consentimento; relacionamento pode ir sem", () => {
    expect(canMessage("ANIVERSARIO", false)).toBe(false);
    expect(canMessage("UPGRADE", false)).toBe(false);
    expect(canMessage("POS_VENDA", false)).toBe(true);
    expect(canMessage("GARANTIA", false)).toBe(true);
    expect(canMessage("ANIVERSARIO", true)).toBe(true);
  });

  it("mensagem com variáveis", () => {
    const msg = renderMessage("Oi, {{cliente.primeiro_nome}}! Seu {{aparelho}} — {{loja.nome}}", profile({ name: "Maria Souza" }), { name: "RP iPhones" });
    expect(msg).toBe("Oi, Maria! Seu iPhone 15 128GB — RP iPhones");
  });

  it("tarefas automáticas de aniversário são idempotentes e respeitam o consentimento", async () => {
    const now = new Date();
    const birth = new Date(Date.UTC(1990, now.getMonth(), now.getDate(), 15));
    const yes = await db.customer.create({ data: { name: "Aniversariante Sim", birthDate: birth, marketingConsent: true } });
    const no = await db.customer.create({ data: { name: "Aniversariante Não", birthDate: birth, marketingConsent: false } });
    await generateAutoTasks(db, { force: true });
    await generateAutoTasks(db, { force: true });
    expect(await db.task.count({ where: { customerId: yes.id, type: "ANIVERSARIO" } })).toBe(1);
    expect(await db.task.count({ where: { customerId: no.id } })).toBe(0);
  });
});
