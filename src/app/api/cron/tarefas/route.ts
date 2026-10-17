// Geração diária de tarefas automáticas (aniversários, garantias). Para a Vercel Cron, defina
// CRON_SECRET: a Vercel envia "Authorization: Bearer <CRON_SECRET>". Sem o segredo, a rota fica desativada.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateAutoTasks } from "@/features/marketing/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Defina CRON_SECRET para habilitar esta rota." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const r = await generateAutoTasks(db, { force: true });
  return NextResponse.json({ ok: true, created: r.created });
}
