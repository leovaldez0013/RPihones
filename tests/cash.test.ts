import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { closeCash, cashMovement, openCash, sessionTotals } from "@/features/finance/cash";
import { saveSale } from "@/features/sales/service";
import { saleSchema } from "@/features/sales/schemas";
import { createDevice } from "@/features/devices/service";
import { DEFAULT_CATEGORIES } from "@/features/finance/categories";
import { deviceData, testModel, testUser } from "./helpers";

let caixaId = "";

beforeAll(async () => {
  for (const c of DEFAULT_CATEGORIES) await db.category.upsert({ where: { key: c.key }, update: {}, create: { ...c, system: true } });
  const caixa = (await db.financialAccount.findFirst({ where: { kind: "CAIXA" } })) ?? (await db.financialAccount.create({ data: { name: "Caixa", kind: "CAIXA" } }));
  if (!(await db.financialAccount.findFirst({ where: { kind: "BANCO" } }))) await db.financialAccount.create({ data: { name: "Banco", kind: "BANCO" } });
  caixaId = caixa.id;
});

describe("caixa por turno", () => {
  it("apura dinheiro de vendas, sangria e suprimento e registra a diferença no fechamento", async () => {
    const user = await testUser("VENDEDOR");
    const model = await testModel();
    const device = await db.$transaction((tx) => createDevice(tx, deviceData(model.id, { salePrice: 150000 }), { userId: user.id }));

    const session = await db.$transaction((tx) => openCash(tx, caixaId, 20000, user.id));
    await expect(db.$transaction((tx) => openCash(tx, caixaId, 0, user.id))).rejects.toThrow(/já tem um caixa aberto/);

    await db.$transaction((tx) =>
      saveSale(
        tx,
        saleSchema.parse({ action: "CONCLUIR", items: [{ kind: "DEVICE", deviceId: device.id }], payments: [{ method: "DINHEIRO", amount: 100000 }, { method: "PIX", amount: 50000 }] }),
        { id: user.id, role: "VENDEDOR" },
      ),
    );

    await db.$transaction((tx) => cashMovement(tx, { sessionId: session.id, type: "SUPRIMENTO", amount: 5000, reason: "troco" }, user.id));
    await db.$transaction((tx) => cashMovement(tx, { sessionId: session.id, type: "SANGRIA", amount: 80000, reason: "depósito" }, user.id));
    await expect(db.$transaction((tx) => cashMovement(tx, { sessionId: session.id, type: "SANGRIA", amount: 999999, reason: "demais" }, user.id))).rejects.toThrow(/maior que o dinheiro/);

    const t = await sessionTotals(db, session.id);
    expect(t.cashIn).toBe(100000);
    expect(t.expectedCash).toBe(20000 + 100000 + 5000 - 80000);
    expect(t.byMethod.PIX).toBe(50000);

    const closed = await db.$transaction((tx) => closeCash(tx, session.id, 44000, "faltou 10 reais", user.id));
    expect(closed.difference).toBe(-1000);
    const s = await db.cashSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(s.closedAt).not.toBeNull();
    expect(s.difference).toBe(-1000);
  });
});
