import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { cancelSale, saveSale } from "@/features/sales/service";
import { createDevice } from "@/features/devices/service";
import { saleSchema } from "@/features/sales/schemas";
import { DEFAULT_CATEGORIES } from "@/features/finance/categories";
import { deviceData, emptyChecklistForTests, nextImei, testModel, testUser } from "./helpers";

let maquininhaId = "";

beforeAll(async () => {
  for (const c of DEFAULT_CATEGORIES) await db.category.upsert({ where: { key: c.key }, update: {}, create: { ...c, system: true } });
  if (!(await db.financialAccount.findFirst({ where: { kind: "CAIXA" } }))) await db.financialAccount.create({ data: { name: "Caixa", kind: "CAIXA" } });
  if (!(await db.financialAccount.findFirst({ where: { kind: "BANCO" } }))) await db.financialAccount.create({ data: { name: "Banco", kind: "BANCO" } });
  let maq = await db.financialAccount.findFirst({ where: { kind: "MAQUININHA" } });
  if (!maq) {
    maq = await db.financialAccount.create({ data: { name: "Maquininha", kind: "MAQUININHA" } });
    await db.cardFee.create({ data: { accountId: maq.id, method: "DEBITO", installments: 1, feePct: 1.5, customerRatePct: 0, settlementDays: 1 } });
    await db.cardFee.create({ data: { accountId: maq.id, method: "CREDITO", installments: 1, feePct: 3, customerRatePct: 0, settlementDays: 30 } });
    await db.cardFee.create({ data: { accountId: maq.id, method: "CREDITO", installments: 10, feePct: 10, customerRatePct: 12, settlementDays: 30 } });
  }
  maquininhaId = maq.id;
  await db.storeSettings.upsert({ where: { id: "default" }, create: { id: "default", tradeInDefaultStatus: "EM_AVALIACAO" }, update: {} });
});

async function stockDevice(userId: string, over: Parameters<typeof deviceData>[1] = {}) {
  const model = await testModel();
  return db.$transaction((tx) => createDevice(tx, deviceData(model.id, over), { userId }));
}

const parse = (v: unknown) => saleSchema.parse(v);

describe("vendas (PDV)", () => {
  it("venda com troca + crédito parcelado: estoque, troca, recebíveis, juros e comissão", async () => {
    const seller = await testUser("VENDEDOR");
    const device = await stockDevice(seller.id, { salePrice: 500000, acquisitionCost: 380000 });
    const tradeModel = await testModel();
    const customer = await db.customer.create({ data: { name: "Cliente Troca" } });
    const tradeImei = nextImei();

    const sale = await db.$transaction((tx) =>
      saveSale(
        tx,
        parse({
          action: "CONCLUIR",
          customerId: customer.id,
          items: [{ kind: "DEVICE", deviceId: device.id, discount: 0 }],
          tradeIns: [
            { key: "t1", imei: tradeImei, modelId: tradeModel.id, capacity: "128GB", color: "Preto", batteryHealth: 86, grade: "A", checklist: emptyChecklistForTests(), suggestedValue: 150000, finalValue: 150000 },
          ],
          payments: [{ method: "CREDITO_PARCELADO", amount: 350000, installments: 10, accountId: maquininhaId }],
        }),
        { id: seller.id, role: "VENDEDOR" },
      ),
    );

    expect(sale.status).toBe("CONCLUIDA");
    expect(sale.total).toBe(500000);
    expect(sale.interest).toBe(42000); // 12% de 3.500,00
    expect(sale.cardFees).toBe(39200); // 10% de 3.920,00
    expect(sale.commission).toBe(10000); // 2% (padrão do vendedor de teste)

    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe("VENDIDO");

    const trade = await db.device.findUniqueOrThrow({ where: { imei: tradeImei } });
    expect(trade.origin).toBe("TROCA");
    expect(trade.acquisitionCost).toBe(150000);
    expect(trade.status).toBe("EM_AVALIACAO");
    const ti = await db.tradeIn.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(ti.deviceId).toBe(trade.id);
    expect(ti.customerId).toBe(customer.id);

    const payments = await db.salePayment.findMany({ where: { saleId: sale.id } });
    expect(payments.map((p) => p.method).sort()).toEqual(["CREDITO_PARCELADO", "TROCA"]);

    const entries = await db.financialEntry.findMany({ where: { originType: "VENDA", originId: sale.id }, orderBy: { installment: "asc" } });
    expect(entries).toHaveLength(10);
    expect(entries.reduce((a, e) => a + e.amount, 0)).toBe(392000);
    expect(entries.reduce((a, e) => a + e.netAmount, 0)).toBe(392000 - 39200);
    expect(entries.every((e) => e.status === "ABERTA" && e.accountId === maquininhaId)).toBe(true);

    const task = await db.task.findUnique({ where: { key: `POS_VENDA:${sale.id}` } });
    expect(task?.customerId).toBe(customer.id);
  });

  it("exige pagamento exato", async () => {
    const seller = await testUser("VENDEDOR");
    const device = await stockDevice(seller.id, { salePrice: 100000 });
    await expect(
      db.$transaction((tx) =>
        saveSale(tx, parse({ action: "CONCLUIR", items: [{ kind: "DEVICE", deviceId: device.id }], payments: [{ method: "PIX", amount: 90000 }] }), { id: seller.id, role: "VENDEDOR" }),
      ),
    ).rejects.toThrow(/Falta receber/);
  });

  it("desconto acima do limite exige senha de gerente", async () => {
    const seller = await testUser("VENDEDOR"); // limite 5%
    const manager = await db.user.create({ data: { name: "Gerente", email: `ger-${Date.now()}@x.com`, passwordHash: await bcrypt.hash("segredo", 4), role: "GERENTE", discountLimitPct: 15 } });
    const device = await stockDevice(seller.id, { salePrice: 100000 });
    const base = { action: "CONCLUIR", items: [{ kind: "DEVICE", deviceId: device.id, discount: 10000 }], payments: [{ method: "DINHEIRO", amount: 90000 }] };

    await expect(db.$transaction((tx) => saveSale(tx, parse(base), { id: seller.id, role: "VENDEDOR" }))).rejects.toMatchObject({ code: "DISCOUNT_APPROVAL" });
    await expect(
      db.$transaction((tx) => saveSale(tx, parse({ ...base, approval: { email: manager.email, password: "errada" } }), { id: seller.id, role: "VENDEDOR" })),
    ).rejects.toThrow(/inválidas/);
    const sale = await db.$transaction((tx) => saveSale(tx, parse({ ...base, approval: { email: manager.email, password: "segredo" } }), { id: seller.id, role: "VENDEDOR" }));
    expect(sale.approvedById).toBe(manager.id);
  });

  it("um IMEI nunca está em duas vendas; orçamento reserva o aparelho para o cliente", async () => {
    const seller = await testUser("VENDEDOR");
    const device = await stockDevice(seller.id, { salePrice: 100000 });
    const [c1, c2] = await Promise.all([db.customer.create({ data: { name: "C1" } }), db.customer.create({ data: { name: "C2" } })]);
    const quote = await db.$transaction((tx) =>
      saveSale(tx, parse({ action: "ORCAMENTO", customerId: c1.id, items: [{ kind: "DEVICE", deviceId: device.id }] }), { id: seller.id, role: "VENDEDOR" }),
    );
    const reserved = await db.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(reserved.status).toBe("RESERVADO");
    expect(reserved.reservedForSaleId).toBe(quote.id);

    // outro cliente não pode comprar
    await expect(
      db.$transaction((tx) =>
        saveSale(tx, parse({ action: "CONCLUIR", customerId: c2.id, items: [{ kind: "DEVICE", deviceId: device.id }], payments: [{ method: "PIX", amount: 100000 }] }), { id: seller.id, role: "VENDEDOR" }),
      ),
    ).rejects.toThrow(/reservado/);

    // o orçamento vira venda
    const done = await db.$transaction((tx) =>
      saveSale(tx, parse({ id: quote.id, action: "CONCLUIR", customerId: c1.id, items: [{ kind: "DEVICE", deviceId: device.id }], payments: [{ method: "PIX", amount: 100000 }] }), {
        id: seller.id,
        role: "VENDEDOR",
      }),
    );
    expect(done.status).toBe("CONCLUIDA");
    // e não pode ser vendido de novo
    await expect(
      db.$transaction((tx) =>
        saveSale(tx, parse({ action: "CONCLUIR", items: [{ kind: "DEVICE", deviceId: device.id }], payments: [{ method: "PIX", amount: 100000 }] }), { id: seller.id, role: "VENDEDOR" }),
      ),
    ).rejects.toThrow(/não está disponível/);
  });

  it("devolução: aparelho volta ao estoque, troca volta ao cliente e financeiro é estornado", async () => {
    const seller = await testUser("GERENTE");
    const device = await stockDevice(seller.id, { salePrice: 300000 });
    const tradeModel = await testModel();
    const acc = await db.accessory.create({ data: { sku: `S-${Date.now()}`, name: "Capa", category: "CAPA", quantity: 5, cost: 1000, price: 5000 } });
    const customer = await db.customer.create({ data: { name: "Cliente Devolução" } });
    const tradeImei = nextImei();
    const sale = await db.$transaction((tx) =>
      saveSale(
        tx,
        parse({
          action: "CONCLUIR",
          customerId: customer.id,
          items: [
            { kind: "DEVICE", deviceId: device.id },
            { kind: "ACCESSORY", accessoryId: acc.id, quantity: 2 },
          ],
          tradeIns: [{ key: "t", imei: tradeImei, modelId: tradeModel.id, capacity: "128GB", color: "Preto", checklist: emptyChecklistForTests(), suggestedValue: 100000, finalValue: 100000 }],
          payments: [
            { method: "PIX", amount: 150000 },
            { method: "DEBITO", amount: 60000, accountId: maquininhaId },
          ],
        }),
        { id: seller.id, role: "GERENTE" },
      ),
    );
    expect((await db.accessory.findUniqueOrThrow({ where: { id: acc.id } })).quantity).toBe(3);

    await db.$transaction((tx) => cancelSale(tx, { id: sale.id, type: "DEVOLUCAO", reason: "Cliente desistiu" }, { id: seller.id, role: "GERENTE" }));

    const after = await db.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(after.status).toBe("DEVOLVIDA");
    expect(after.commission).toBe(0);
    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe("DISPONIVEL");
    expect((await db.accessory.findUniqueOrThrow({ where: { id: acc.id } })).quantity).toBe(5);
    expect((await db.device.findUniqueOrThrow({ where: { imei: tradeImei } })).status).toBe("DEVOLVIDO");

    // PIX pago → estorno (saída); débito em aberto → cancelado
    const pix = await db.financialEntry.findFirstOrThrow({ where: { originType: "VENDA", originId: sale.id, method: "PIX" } });
    const refund = await db.financialEntry.findFirst({ where: { originType: "ESTORNO", originId: pix.id } });
    expect(refund?.type).toBe("PAGAR");
    expect(refund?.amount).toBe(150000);
    const debit = await db.financialEntry.findFirstOrThrow({ where: { originType: "VENDA", originId: sale.id, method: "DEBITO" } });
    expect(debit.status).toBe("CANCELADA");

    await expect(db.$transaction((tx) => cancelSale(tx, { id: sale.id, type: "CANCELAMENTO", reason: "de novo" }, { id: seller.id, role: "GERENTE" }))).rejects.toThrow(/já foi/);
  });

  it("recusa troca com iCloud vinculado", async () => {
    const seller = await testUser("VENDEDOR");
    const device = await stockDevice(seller.id, { salePrice: 300000 });
    const tradeModel = await testModel();
    const customer = await db.customer.create({ data: { name: "C" } });
    await expect(
      db.$transaction((tx) =>
        saveSale(
          tx,
          parse({
            action: "CONCLUIR",
            customerId: customer.id,
            items: [{ kind: "DEVICE", deviceId: device.id }],
            tradeIns: [{ key: "t", imei: nextImei(), modelId: tradeModel.id, capacity: "128GB", color: "Preto", checklist: { ...emptyChecklistForTests(), icloud: false }, suggestedValue: 1, finalValue: 100000 }],
            payments: [{ method: "PIX", amount: 200000 }],
          }),
          { id: seller.id, role: "VENDEDOR" },
        ),
      ),
    ).rejects.toThrow(/iCloud/);
  });
});
