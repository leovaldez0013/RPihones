import type { PrismaClient } from "@prisma/client";
import { addDays } from "./util";

type SeedDevice = { id: string; model: string; modelId: string; supplierId: string; capacity: string; color: string; condition: string; salePrice: number; cost: number; entryDate: Date };

/** Agrupa os aparelhos do seed em pedidos de compra recebidos (com contas a pagar coerentes). */
export async function seedPurchasesFromDevices(db: PrismaClient, devices: SeedDevice[], userId: string, bancoId: string) {
  const [cat, suppliers] = await Promise.all([
    db.category.findUniqueOrThrow({ where: { key: "COMPRA_MERCADORIA" } }),
    db.supplier.findMany(),
  ]);
  const supplierName = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const groups = new Map<string, SeedDevice[]>();
  for (const d of devices) {
    const week = Math.floor(d.entryDate.getTime() / (7 * 86400000));
    const key = `${d.supplierId}:${week}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  let number = 0;
  const sorted = [...groups.values()].sort((a, b) => a[0].entryDate.getTime() - b[0].entryDate.getTime());
  for (const list of sorted) {
    number++;
    const first = list.reduce((min, d) => (d.entryDate < min ? d.entryDate : min), list[0].entryDate);
    const total = list.reduce((s, d) => s + d.cost, 0);
    const supplierId = list[0].supplierId;
    const po = await db.purchaseOrder.create({
      data: {
        number,
        supplierId,
        status: "RECEBIDO",
        orderedAt: addDays(first, -3),
        expectedAt: first,
        dueDate: addDays(first, 30),
        total,
        createdById: userId,
        createdAt: addDays(first, -3),
      },
    });

    const byItem = new Map<string, SeedDevice[]>();
    for (const d of list) {
      const k = `${d.modelId}|${d.capacity}|${d.condition}`;
      byItem.set(k, [...(byItem.get(k) ?? []), d]);
    }
    for (const [, ds] of byItem) {
      const item = await db.purchaseItem.create({
        data: {
          purchaseId: po.id,
          kind: "DEVICE",
          modelId: ds[0].modelId,
          capacity: ds[0].capacity,
          condition: ds[0].condition,
          description: `${ds[0].model} ${ds[0].capacity}`,
          quantity: ds.length,
          receivedQty: ds.length,
          unitCost: Math.round(ds.reduce((s, d) => s + d.cost, 0) / ds.length),
          salePrice: ds[0].salePrice,
        },
      });
      await db.device.updateMany({ where: { id: { in: ds.map((d) => d.id) } }, data: { purchaseItemId: item.id } });
      await db.deviceEvent.updateMany({ where: { deviceId: { in: ds.map((d) => d.id) }, type: "ENTRADA" }, data: { refType: "COMPRA", refId: po.id, description: `Entrada pela compra #${number} — ${supplierName[supplierId]}` } });
    }

    const due = addDays(first, 30);
    const paid = due < new Date();
    await db.financialEntry.create({
      data: {
        type: "PAGAR",
        description: `Compra #${number} — ${supplierName[supplierId]} (${list.length} itens)`,
        amount: total,
        netAmount: total,
        dueDate: due,
        status: paid ? "PAGA" : "ABERTA",
        paidAt: paid ? due : null,
        categoryId: cat.id,
        accountId: bancoId,
        method: "TRANSFERENCIA",
        supplierId,
        originType: "COMPRA",
        originId: po.id,
        createdById: userId,
        createdAt: first,
      },
    });
  }

  await db.sequence.upsert({ where: { key: "PURCHASE" }, update: { value: number }, create: { key: "PURCHASE", value: number } });
  return number;
}

/** Um pedido em aberto (aguardando chegada) e um rascunho, para testar o recebimento. */
export async function seedOpenPurchases(db: PrismaClient, userId: string, supplierIds: string[], accessoryIds: Record<string, string>) {
  const models = await db.deviceModel.findMany({ where: { name: { in: ["iPhone 16 Pro", "iPhone 17"] } } });
  const m = Object.fromEntries(models.map((x) => [x.name, x.id]));
  const seq = await db.sequence.findUniqueOrThrow({ where: { key: "PURCHASE" } });
  let n = seq.value;

  await db.purchaseOrder.create({
    data: {
      number: ++n,
      supplierId: supplierIds[0],
      status: "PEDIDO",
      orderedAt: addDays(new Date(), -2),
      expectedAt: addDays(new Date(), 2),
      dueDate: addDays(new Date(), 30),
      total: 3 * 520000 + 2 * 580000 + 20 * 600,
      createdById: userId,
      items: {
        create: [
          { kind: "DEVICE", modelId: m["iPhone 16 Pro"], capacity: "256GB", condition: "SEMINOVO", description: "iPhone 16 Pro 256GB", quantity: 3, unitCost: 520000, salePrice: 679000 },
          { kind: "DEVICE", modelId: m["iPhone 17"], capacity: "256GB", condition: "NOVO", description: "iPhone 17 256GB", quantity: 2, unitCost: 580000, salePrice: 789000 },
          { kind: "ACCESSORY", accessoryId: accessoryIds["PEL-3D-17"], description: "Película 3D vidro iPhone 17 / 17 Pro", quantity: 20, unitCost: 600 },
        ],
      },
    },
  });
  await db.purchaseOrder.create({
    data: {
      number: ++n,
      supplierId: supplierIds[2],
      status: "RASCUNHO",
      total: 10 * 3800,
      createdById: userId,
      items: { create: [{ kind: "ACCESSORY", accessoryId: accessoryIds["CAP-MS-16PM"], description: "Capa silicone MagSafe iPhone 16 Pro Max", quantity: 10, unitCost: 3800 }] },
    },
  });
  await db.sequence.update({ where: { key: "PURCHASE" }, data: { value: n } });
}
