import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { REPORTS, buildReport, type ReportKey } from "@/features/reports/queries";
import { parsePeriod } from "@/features/reports/period";
import { renderReportPdf } from "@/features/reports/pdf";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !can(user.role, "reports.view")) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const url = new URL(req.url);
  const key = REPORTS.find((r) => r.key === url.searchParams.get("tipo"))?.key as ReportKey | undefined;
  if (!key) return NextResponse.json({ error: "Relatório inválido" }, { status: 400 });
  const { from, to, fromStr, toStr } = parsePeriod(url.searchParams.get("de"), url.searchParams.get("ate"));
  const [report, store] = await Promise.all([buildReport(key, from, to), db.storeSettings.findUnique({ where: { id: "default" }, select: { name: true } })]);
  const buffer = await renderReportPdf(report, { storeName: store?.name ?? "Loja", from, toInclusive: new Date(to.getTime() - 3600000) });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-${key}-${fromStr}-a-${toStr}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
