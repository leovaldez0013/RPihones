import "server-only";
import { db, parseJson } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";
import { getCatalog } from "@/features/devices/queries";
import { getCardRules } from "./config";

/** Dados que o PDV precisa: taxas, catálogo (troca), vendedores, contas e o orçamento em edição. */
export async function getPosData(user: SessionUser, opts: { quoteId?: string; customerId?: string; orderId?: string }) {
  const [cardRules, catalog, sellers, me, accounts] = await Promise.all([
    getCardRules(db),
    getCatalog(),
    can(user.role, "sales.viewAll")
      ? db.user.findMany({ where: { active: true, deletedAt: null, role: { in: ["VENDEDOR", "GERENTE", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { discountLimitPct: true } }),
    db.financialAccount.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
  ]);

  let quote = null;
  if (opts.quoteId) {
    const s = await db.sale.findUnique({
      where: { id: opts.quoteId },
      include: { items: { include: { device: { include: { model: true } }, accessory: true } }, customer: true, tradeIns: true },
    });
    if (s && s.status === "ORCAMENTO" && !s.deletedAt) {
      quote = {
        id: s.id,
        number: s.number,
        customer: s.customer ? { id: s.customer.id, name: s.customer.name, cpf: s.customer.cpf, phone: s.customer.phone } : null,
        sellerId: s.sellerId,
        discount: s.discount,
        notes: s.notes ?? "",
        items: s.items.map((i) => ({
          kind: i.kind as "DEVICE" | "ACCESSORY" | "SERVICE",
          refId: i.deviceId ?? i.accessoryId ?? i.id,
          title: i.device ? `${i.device.model.name} ${i.device.capacity}` : (i.accessory?.name ?? i.description),
          subtitle: i.device ? `${i.device.color} · IMEI ${i.device.imei}` : i.accessory ? `SKU ${i.accessory.sku}` : "Serviço",
          unitPrice: i.device?.salePrice ?? i.accessory?.price ?? i.unitPrice,
          quantity: i.quantity,
          discount: i.discount,
          stock: i.accessory?.quantity,
        })),
        tradeIns: s.tradeIns.map((t) => ({
          key: t.id,
          imei: t.imei,
          modelId: t.modelId,
          capacity: t.capacity,
          color: t.color,
          batteryHealth: t.batteryHealth,
          grade: t.grade ?? "",
          checklist: parseJson<Record<string, boolean>>(t.checklist, {}),
          photos: parseJson<string[]>(t.photos, []),
          notes: t.notes ?? "",
          suggestedValue: t.suggestedValue,
          finalValue: t.finalValue,
        })),
      };
    }
  }

  let order = null;
  if (opts.orderId) {
    const o = await db.order.findUnique({ where: { id: opts.orderId }, include: { customer: true } });
    if (o && !o.deletedAt && !["ENTREGUE", "CANCELADA"].includes(o.status)) {
      const d = o.deviceId ? await db.device.findUnique({ where: { id: o.deviceId }, include: { model: true } }) : null;
      order = {
        id: o.id,
        number: o.number,
        deposit: o.deposit,
        customer: { id: o.customer.id, name: o.customer.name, cpf: o.customer.cpf, phone: o.customer.phone },
        item: d
          ? { kind: "DEVICE" as const, refId: d.id, title: `${d.model.name} ${d.capacity}`, subtitle: `${d.color} · IMEI ${d.imei}`, unitPrice: d.salePrice, quantity: 1, discount: 0 }
          : null,
      };
    }
  }

  let customer = order?.customer ?? quote?.customer ?? null;
  if (!customer && opts.customerId) {
    const c = await db.customer.findUnique({ where: { id: opts.customerId } });
    if (c) customer = { id: c.id, name: c.name, cpf: c.cpf, phone: c.phone };
  }

  return { cardRules, catalog, sellers, discountLimitPct: me.discountLimitPct, accounts, quote, customer, order };
}
