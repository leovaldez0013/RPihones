// Backup completo em JSON (todas as tabelas). Somente administrador.
// Chaves de API não são exportadas; senhas saem apenas como hash.
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user || !can(user.role, "backup.export")) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const data: Record<string, unknown[]> = {};
  for (const model of Object.values(Prisma.ModelName)) {
    const key = (model.charAt(0).toLowerCase() + model.slice(1)) as keyof typeof db;
    const delegate = db[key] as unknown as { findMany: () => Promise<Record<string, unknown>[]> };
    const rows = await delegate.findMany();
    data[model] = model === "StoreSettings" ? rows.map((r) => ({ ...r, imeiApiKey: r.imeiApiKey ? "(omitida)" : null })) : rows;
  }
  await audit(db, { userId: user.id, action: "backup.export", entity: "Backup", summary: "Backup completo exportado" });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const body = JSON.stringify({ app: "rp-iphones", version: 1, exportedAt: new Date().toISOString(), exportedBy: user.email, data }, null, 1);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-rp-iphones-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
