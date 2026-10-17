import type { Metadata } from "next";
import Link from "next/link";
import { Cake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { whatsappLink, zoned } from "@/lib/format";
import { ageOn, applySegment, daysUntilBirthday } from "@/domain/marketing";
import { warrantyUntil } from "@/domain/sale";
import { canMessage, generateAutoTasks, getMessageTemplates, loadProfiles, renderMessage, storeInfo } from "@/features/marketing/service";
import { TaskBoard, type TaskRow } from "./task-board";
import { NewTaskForm } from "./new-task-form";

export const metadata: Metadata = { title: "Marketing" };

const TEMPLATE_FOR: Record<string, string> = { POS_VENDA: "POS_VENDA", ANIVERSARIO: "ANIVERSARIO", GARANTIA: "GARANTIA", UPGRADE: "UPGRADE" };

export default async function MarketingTasksPage() {
  const user = await requirePage("marketing.view");
  await generateAutoTasks(db);
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86400000);
  const onlyMine = !can(user.role, "sales.viewAll");
  const [tasks, profiles, templates, store] = await Promise.all([
    db.task.findMany({
      where: {
        OR: [{ doneAt: null }, { doneAt: { gte: since } }],
        dueDate: { lte: new Date(now.getTime() + 7 * 86400000) },
        ...(onlyMine ? { AND: [{ OR: [{ userId: user.id }, { userId: null }] }] } : {}),
      },
      include: { customer: true, user: true },
      orderBy: { dueDate: "asc" },
      take: 300,
    }),
    loadProfiles(db),
    getMessageTemplates(db),
    storeInfo(db),
  ]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  // garantia: a mensagem fala do aparelho daquela venda (o cliente pode ter mais de um)
  const warrantySales = tasks.filter((t) => t.type === "GARANTIA" && t.refId).map((t) => t.refId!);
  const warrantyItems = warrantySales.length
    ? await db.saleItem.findMany({
        where: { saleId: { in: warrantySales }, kind: "DEVICE", active: true },
        select: { saleId: true, warrantyDays: true, sale: { select: { completedAt: true } }, device: { select: { capacity: true, model: { select: { name: true } } } } },
      })
    : [];
  const bySale = new Map(warrantyItems.map((i) => [i.saleId, { lastDevice: i.device ? `${i.device.model.name} ${i.device.capacity}` : null, warrantyUntil: warrantyUntil(i.sale.completedAt!, i.warrantyDays) }]));
  const tpl = new Map(templates.map((t) => [t.key, t]));

  const rows: TaskRow[] = tasks.map((t) => {
    const base = t.customerId ? byId.get(t.customerId) : undefined;
    const p = base && t.type === "GARANTIA" && t.refId && bySale.has(t.refId) ? { ...base, ...bySale.get(t.refId)! } : base;
    const key = TEMPLATE_FOR[t.type];
    const template = key ? tpl.get(key) : undefined;
    const message = p ? (template ? renderMessage(template.content, p, store) : `Olá, ${p.name.split(" ")[0]}! Aqui é da ${store.name}.`) : "";
    const allowed = !!p && canMessage(key ?? "POS_VENDA", p.consent);
    return {
      id: t.id,
      type: t.type,
      title: t.title,
      dueDate: t.dueDate.toISOString(),
      done: !!t.doneAt,
      customer: t.customer ? { id: t.customer.id, name: t.customer.name } : null,
      owner: t.user?.name ?? null,
      templateKey: key ?? "MANUAL",
      whatsapp: p?.phone && allowed ? whatsappLink(p.phone, message) : null,
      message,
      blockedReason: p && !p.phone ? "Sem telefone" : p && !allowed ? "Sem consentimento LGPD" : null,
    };
  });

  const today = zoned(now)!;
  const birthdays = applySegment(profiles, "ANIVERSARIANTES", { param: 7, today });
  const customers = await db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <TaskBoard rows={rows} />
      </div>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="size-4" /> Aniversariantes da semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            {birthdays.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum nos próximos 7 dias.</p>
            ) : (
              <div className="flex flex-col divide-y text-sm">
                {birthdays.map((c) => {
                  const days = daysUntilBirthday(c.birthDate!, today);
                  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
                  return (
                  <Link key={c.id} href={`/clientes/${c.id}`} className="flex items-center justify-between gap-2 py-2 hover:underline">
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {days === 0 ? "hoje" : days === 1 ? "amanhã" : `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`} · faz {ageOn(c.birthDate!, date)} anos
                      </span>
                    </span>
                    {!c.consent && <StatusBadge tone="gray">sem consentimento</StatusBadge>}
                  </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <NewTaskForm customers={customers} />
      </div>
    </div>
  );
}
