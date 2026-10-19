// Resumo dos últimos 30 dias do banco em uso (na simulação: o mês simulado).
import { db } from "@/lib/db";
import { zoned } from "@/lib/format";
import { spDayStart } from "@/features/dashboard/queries";

const DAY = 86400000;

export async function monthSummary(staleDays = 15) {
  const now = new Date();
  const from = spDayStart(now, -29);
  const [sales, items, stock] = await Promise.all([
    db.sale.findMany({ where: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: from } }, select: { total: true, cost: true, cardFees: true, commission: true, completedAt: true } }),
    db.saleItem.findMany({
      where: { active: true, kind: "DEVICE", sale: { deletedAt: null, status: "CONCLUIDA", completedAt: { gte: from } } },
      select: { unitPrice: true, discount: true, unitCost: true, device: { select: { color: true, model: { select: { name: true } } } } },
    }),
    db.device.findMany({ where: { deletedAt: null, status: { not: "VENDIDO" } }, select: { entryDate: true, status: true, imei: true, acquisitionCost: true, salePrice: true } }),
  ]);

  const revenue = sales.reduce((a, s) => a + s.total, 0);
  const profit = sales.reduce((a, s) => a + s.total - s.cost - s.cardFees - s.commission, 0);

  const rank = (key: (i: (typeof items)[number]) => string) => {
    const m = new Map<string, { name: string; count: number; revenue: number }>();
    for (const i of items) {
      const k = key(i);
      const r = m.get(k) ?? { name: k, count: 0, revenue: 0 };
      r.count++;
      r.revenue += i.unitPrice - i.discount;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue);
  };

  const days = Array.from({ length: 30 }, (_, i) => {
    const s = new Date(from.getTime() + i * DAY);
    const e = new Date(s.getTime() + DAY);
    const list = sales.filter((x) => x.completedAt! >= s && x.completedAt! < e);
    const z = zoned(s)!;
    const dow = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][z.getDay()];
    return { label: `${String(z.getDate()).padStart(2, "0")}/${String(z.getMonth() + 1).padStart(2, "0")} ${dow}`, revenue: list.reduce((a, x) => a + x.total, 0), count: list.length };
  });

  const staleLimit = now.getTime() - staleDays * DAY;
  return {
    count: sales.length,
    devicesSold: items.length,
    revenue,
    profit,
    ticket: sales.length ? Math.round(revenue / sales.length) : 0,
    margin: revenue ? (profit / revenue) * 100 : 0,
    topModels: rank((i) => i.device?.model.name ?? "—").slice(0, 8),
    topColors: rank((i) => i.device?.color ?? "—").slice(0, 8),
    stock: {
      count: stock.length,
      withoutImei: stock.filter((d) => !d.imei).length,
      cost: stock.reduce((a, d) => a + d.acquisitionCost, 0),
      stale: stock.filter((d) => d.status === "DISPONIVEL" && d.entryDate.getTime() < staleLimit).length,
    },
    days,
    noSaleDays: days.filter((d) => d.count === 0).length,
  };
}
