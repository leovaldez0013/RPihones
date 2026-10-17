import type { Metadata } from "next";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getMessageTemplates, storeInfo } from "@/features/marketing/service";
import { TemplatesEditor } from "./templates-editor";

export const metadata: Metadata = { title: "Modelos de mensagem" };

export default async function MessageTemplatesPage() {
  const user = await requirePage("marketing.view");
  const [templates, store] = await Promise.all([getMessageTemplates(db), storeInfo(db)]);
  return <TemplatesEditor templates={templates} store={store} canEdit={can(user.role, "settings.operational")} />;
}
