// Marketing pós-venda: perfis de clientes, modelos de mensagem, registro de envios e tarefas automáticas.
import type { PrismaClient } from "@prisma/client";
import { renderTemplate } from "@/domain/template";
import { DEFAULT_MESSAGE_TEMPLATES, daysUntilBirthday, messageContext, templateDef, type CustomerProfile } from "@/domain/marketing";
import { warrantyUntil } from "@/domain/sale";
import { formatDate, zoned } from "@/lib/format";
import { ensureTask } from "@/features/tasks/service";

/** Perfis de compra de todos os clientes ativos (base das segmentações). */
export async function loadProfiles(db: PrismaClient): Promise<CustomerProfile[]> {
  const customers = await db.customer.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      marketingConsent: true,
      birthDate: true,
      sales: {
        where: { deletedAt: null, status: "CONCLUIDA" },
        orderBy: { completedAt: "desc" },
        select: {
          total: true,
          completedAt: true,
          items: { where: { active: true }, select: { kind: true, warrantyDays: true, device: { select: { capacity: true, model: { select: { name: true } } } } } },
        },
      },
    },
  });
  return customers.map((c) => {
    const devices = c.sales.flatMap((s) => s.items.filter((i) => i.kind === "DEVICE" && i.device).map((i) => ({ s, i })));
    const warranties = devices.filter(({ i }) => i.warrantyDays > 0).map(({ s, i }) => warrantyUntil(s.completedAt!, i.warrantyDays).getTime());
    const last = devices[0];
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      consent: c.marketingConsent,
      birthDate: c.birthDate,
      purchases: c.sales.length,
      totalSpent: c.sales.reduce((a, s) => a + s.total, 0),
      lastPurchase: c.sales[0]?.completedAt ?? null,
      firstPurchase: c.sales.at(-1)?.completedAt ?? null,
      models: [...new Set(devices.map(({ i }) => i.device!.model.name))],
      lastDevice: last ? `${last.i.device!.model.name} ${last.i.device!.capacity}` : null,
      lastDeviceDate: last?.s.completedAt ?? null,
      warrantyUntil: warranties.length ? new Date(Math.max(...warranties)) : null,
      boughtAccessory: c.sales.some((s) => s.items.some((i) => i.kind === "ACCESSORY")),
    };
  });
}

/** Modelos de mensagem: os salvos no banco sobrepõem os padrões. */
export async function getMessageTemplates(db: Pick<PrismaClient, "messageTemplate">) {
  const saved = await db.messageTemplate.findMany();
  return DEFAULT_MESSAGE_TEMPLATES.map((d) => {
    const s = saved.find((x) => x.key === d.key);
    return { key: d.key, name: s?.name ?? d.name, content: s?.content ?? d.content, requiresConsent: d.requiresConsent, customized: !!s };
  });
}

export async function storeInfo(db: PrismaClient) {
  const s = await db.storeSettings.findUnique({ where: { id: "default" }, select: { name: true, googleReviewUrl: true } });
  return { name: s?.name ?? "nossa loja", reviewUrl: s?.googleReviewUrl ?? null };
}

export function renderMessage(content: string, profile: Pick<CustomerProfile, "name" | "lastDevice" | "warrantyUntil">, store: { name: string; reviewUrl?: string | null }) {
  return renderTemplate(content, messageContext(profile, store, formatDate)).text.trim();
}

/** Mensagens que exigem consentimento LGPD (marketing) não podem ir para quem não aceitou. */
export function canMessage(templateKey: string, consent: boolean) {
  return consent || !(templateDef(templateKey)?.requiresConsent ?? true);
}

let lastRun = 0;

/**
 * Gera tarefas automáticas de forma idempotente (chave única por cliente/ano ou item de venda):
 * aniversários dos próximos 3 dias (só com consentimento) e garantias vencendo.
 * O pós-venda (D+N) é criado na própria venda. Chamado ao abrir o dashboard/marketing e pela rota de cron.
 */
export async function generateAutoTasks(db: PrismaClient, opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  if (!opts.force && now.getTime() - lastRun < 10 * 60000) return { created: 0, skipped: true };
  lastRun = now.getTime();
  const today = zoned(now)!;
  const settings = await db.storeSettings.findUnique({ where: { id: "default" } });
  const alertDays = settings?.warrantyAlertDays ?? 15;
  let created = 0;
  const before = await db.task.count();

  const birthdays = await db.customer.findMany({ where: { deletedAt: null, marketingConsent: true, birthDate: { not: null } }, select: { id: true, name: true, birthDate: true } });
  for (const c of birthdays) {
    const days = daysUntilBirthday(c.birthDate!, today);
    if (days > 3) continue;
    const due = new Date(now.getTime() + days * 86400000);
    await ensureTask(db, {
      key: `ANIV:${c.id}:${due.getFullYear()}`,
      type: "ANIVERSARIO",
      title: `Aniversário de ${c.name.split(" ")[0]} ${days === 0 ? "é hoje" : `em ${days} dia(s)`} — mandar parabéns`,
      dueDate: due,
      customerId: c.id,
      refType: "CLIENTE",
      refId: c.id,
    });
  }

  // garantia vencendo: itens de aparelho com fim de garantia dentro da janela
  const since = new Date(now.getTime() - 400 * 86400000);
  const items = await db.saleItem.findMany({
    where: { kind: "DEVICE", active: true, warrantyDays: { gt: 0 }, sale: { status: "CONCLUIDA", deletedAt: null, customerId: { not: null }, completedAt: { gte: since } } },
    select: { id: true, warrantyDays: true, description: true, sale: { select: { id: true, completedAt: true, sellerId: true, customer: { select: { id: true, name: true } } } } },
  });
  for (const i of items) {
    const end = warrantyUntil(i.sale.completedAt!, i.warrantyDays);
    const left = (end.getTime() - now.getTime()) / 86400000;
    if (left < 0 || left > alertDays) continue;
    await ensureTask(db, {
      key: `GARANTIA:${i.id}`,
      type: "GARANTIA",
      title: `Garantia de ${i.sale.customer!.name.split(" ")[0]} vence em ${formatDate(end)} — ${i.description.split(" — ")[0]}`,
      dueDate: new Date(Math.max(now.getTime(), end.getTime() - 5 * 86400000)),
      customerId: i.sale.customer!.id,
      userId: i.sale.sellerId,
      refType: "VENDA",
      refId: i.sale.id,
    });
  }
  created = (await db.task.count()) - before;
  return { created, skipped: false };
}
