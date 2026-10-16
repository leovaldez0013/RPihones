import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { AuditTable } from "./audit-table";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditPage() {
  await requirePage("audit.view");
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 1000, include: { user: true } });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Log de auditoria" description="Últimas 1.000 ações registradas no sistema." back="/configuracoes" />
      <AuditTable
        rows={logs.map((l) => ({
          id: l.id,
          createdAt: l.createdAt.toISOString(),
          user: l.user?.name ?? "Sistema",
          action: l.action,
          entity: l.entity,
          summary: l.summary ?? "",
          before: l.before ?? "",
          after: l.after ?? "",
        }))}
      />
    </div>
  );
}
