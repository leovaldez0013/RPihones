import type { Metadata } from "next";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { whatsappLink, zoned } from "@/lib/format";
import { SEGMENTS, applySegment, daysUntilBirthday, type SegmentKey } from "@/domain/marketing";
import { canMessage, getMessageTemplates, loadProfiles, renderMessage, storeInfo } from "@/features/marketing/service";
import { Campaign, type CampaignRow } from "./campaign";

export const metadata: Metadata = { title: "Campanhas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ seg?: string; p?: string; modelo?: string; tpl?: string }> }) {
  await requirePage("marketing.view");
  const sp = await searchParams;
  const segment = SEGMENTS.find((s) => s.key === sp.seg) ?? SEGMENTS[0];
  const param = sp.p ? Number(sp.p) : segment.param?.default;
  const [profiles, templates, store, models] = await Promise.all([
    loadProfiles(db),
    getMessageTemplates(db),
    storeInfo(db),
    db.deviceModel.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true } }),
  ]);
  const template = templates.find((t) => t.key === sp.tpl) ?? templates.find((t) => t.key === segment.template)!;
  const now = new Date();
  const today = zoned(now)!;
  const model = segment.key === "MODELO" ? (sp.modelo ?? profiles.flatMap((p) => p.models)[0] ?? null) : null;
  const list = applySegment(profiles, segment.key as SegmentKey, { param, model, today });

  // último envio deste modelo por cliente (evita mandar duas vezes)
  const sends = await db.campaignSend.findMany({
    where: { templateKey: template.key, customerId: { in: list.map((c) => c.id) }, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
    orderBy: { createdAt: "desc" },
    select: { customerId: true, createdAt: true },
  });
  const lastSend = new Map<string, Date>();
  for (const s of sends) if (!lastSend.has(s.customerId)) lastSend.set(s.customerId, s.createdAt);

  const rows: CampaignRow[] = list.map((c) => {
    const message = renderMessage(template.content, c, store);
    const allowed = canMessage(template.key, c.consent);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      consent: c.consent,
      lastDevice: c.lastDevice,
      lastPurchase: c.lastPurchase?.toISOString() ?? null,
      totalSpent: c.totalSpent,
      purchases: c.purchases,
      birthday: c.birthDate ? daysUntilBirthday(c.birthDate, today) : null,
      birthDate: c.birthDate?.toISOString() ?? null,
      warrantyUntil: c.warrantyUntil?.toISOString() ?? null,
      message,
      whatsapp: allowed && c.phone ? whatsappLink(c.phone, message) : null,
      blockedReason: !c.phone ? "Sem telefone" : !allowed ? "Sem consentimento" : null,
      lastSent: lastSend.get(c.id)?.toISOString() ?? null,
    };
  });

  return (
    <Campaign
      segments={SEGMENTS.map((s) => ({ key: s.key, label: s.label, param: s.param, template: s.template }))}
      segment={segment.key}
      param={param ?? null}
      model={model}
      models={[...new Set(models.map((m) => m.name))].filter((m) => profiles.some((p) => p.models.includes(m)))}
      templates={templates.map((t) => ({ key: t.key, name: t.name, requiresConsent: t.requiresConsent }))}
      templateKey={template.key}
      rows={rows}
    />
  );
}
