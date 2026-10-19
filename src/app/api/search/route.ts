import { NextResponse } from "next/server";
import { db, ci } from "@/lib/db";
import { getUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatBRL } from "@/domain/money";
import { DEVICE_STATUS, SALE_STATUS, SO_STATUS, ORDER_STATUS } from "@/domain/constants";
import { formatCPF, formatPhone, formatDate, imeiText } from "@/lib/format";
import type { SearchResult } from "@/components/layout/command-palette";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);
  const digits = q.replace(/\D/g, "");
  const isNumeric = digits.length > 0 && digits.length === q.replace(/[\s.\-/()#]/g, "").length;
  const num = isNumeric && digits.length <= 7 ? Number(digits) : null;

  const results: SearchResult[] = [];
  const tasks: Promise<void>[] = [];

  if (can(user.role, "devices.view")) {
    tasks.push(
      db.device
        .findMany({
          where: {
            deletedAt: null,
            OR: isNumeric
              ? [{ imei: { contains: digits } }, { imei2: { contains: digits } }, { serial: ci(q) }]
              : [{ serial: ci(q) }, { model: { name: ci(q) } }],
          },
          include: { model: true },
          take: 6,
          orderBy: { entryDate: "desc" },
        })
        .then((rows) => {
          for (const d of rows)
            results.push({
              type: "device",
              id: d.id,
              title: `${d.model.name} ${d.capacity} ${d.color}`,
              subtitle: `${imeiText(d.imei)} · ${DEVICE_STATUS.label(d.status)} · ${formatBRL(d.salePrice)}`,
              href: `/estoque/aparelhos/${d.id}`,
            });
        }),
    );
  }

  if (can(user.role, "customers.view")) {
    tasks.push(
      db.customer
        .findMany({
          where: {
            deletedAt: null,
            OR: isNumeric
              ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }]
              : [{ name: ci(q) }, { email: ci(q) }],
          },
          take: 6,
          orderBy: { name: "asc" },
        })
        .then((rows) => {
          for (const c of rows)
            results.push({
              type: "customer",
              id: c.id,
              title: c.name,
              subtitle: [c.cpf && formatCPF(c.cpf), c.phone && formatPhone(c.phone)].filter(Boolean).join(" · "),
              href: `/clientes/${c.id}`,
            });
        }),
    );
  }

  if (can(user.role, "accessories.view") && !isNumeric) {
    tasks.push(
      db.accessory
        .findMany({ where: { deletedAt: null, OR: [{ name: ci(q) }, { sku: ci(q) }] }, take: 4 })
        .then((rows) => {
          for (const a of rows)
            results.push({
              type: "accessory",
              id: a.id,
              title: a.name,
              subtitle: `SKU ${a.sku} · ${a.quantity} un. · ${formatBRL(a.price)}`,
              href: `/estoque/acessorios?q=${encodeURIComponent(a.sku)}`,
            });
        }),
    );
  } else if (can(user.role, "accessories.view") && isNumeric && digits.length >= 8) {
    tasks.push(
      db.accessory.findMany({ where: { deletedAt: null, barcode: digits }, take: 2 }).then((rows) => {
        for (const a of rows)
          results.push({
            type: "accessory",
            id: a.id,
            title: a.name,
            subtitle: `Código ${a.barcode} · ${a.quantity} un.`,
            href: `/estoque/acessorios?q=${encodeURIComponent(a.sku)}`,
          });
      }),
    );
  }

  if (num != null && can(user.role, "sales.view")) {
    tasks.push(
      db.sale
        .findMany({
          where: {
            number: num,
            deletedAt: null,
            ...(can(user.role, "sales.viewAll") ? {} : { sellerId: user.id }),
          },
          include: { customer: true },
          take: 3,
        })
        .then((rows) => {
          for (const s of rows)
            results.push({
              type: "sale",
              id: s.id,
              title: `Venda #${s.number} — ${s.customer?.name ?? "Consumidor"}`,
              subtitle: `${SALE_STATUS.label(s.status)} · ${formatBRL(s.total)} · ${formatDate(s.createdAt)}`,
              href: `/vendas/${s.id}`,
            });
        }),
    );
  }

  if (num != null && can(user.role, "serviceOrders.view")) {
    tasks.push(
      db.serviceOrder
        .findMany({ where: { number: num, deletedAt: null }, include: { customer: true }, take: 3 })
        .then((rows) => {
          for (const o of rows)
            results.push({
              type: "so",
              id: o.id,
              title: `OS #${o.number}${o.customer ? ` — ${o.customer.name}` : ""}`,
              subtitle: `${SO_STATUS.label(o.status)} · ${o.problem}`,
              href: `/os/${o.id}`,
            });
        }),
    );
  }

  if (num != null && can(user.role, "orders.view")) {
    tasks.push(
      db.order
        .findMany({ where: { number: num, deletedAt: null }, include: { customer: true }, take: 3 })
        .then((rows) => {
          for (const o of rows)
            results.push({
              type: "order",
              id: o.id,
              title: `Encomenda #${o.number} — ${o.customer.name}`,
              subtitle: `${ORDER_STATUS.label(o.status)} · ${o.modelName}`,
              href: `/encomendas/${o.id}`,
            });
        }),
    );
  }

  await Promise.all(tasks);
  return NextResponse.json(results);
}
