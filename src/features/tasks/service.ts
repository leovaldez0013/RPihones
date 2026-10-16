import type { Tx } from "@/lib/db";

/** Cria uma tarefa de forma idempotente (mesma `key` não duplica). */
export async function ensureTask(
  tx: Tx,
  t: { key: string; type: string; title: string; dueDate: Date; customerId?: string | null; userId?: string | null; refType?: string; refId?: string },
) {
  const existing = await tx.task.findUnique({ where: { key: t.key } });
  if (existing) return existing;
  return tx.task.create({ data: { ...t, customerId: t.customerId ?? null, userId: t.userId ?? null } });
}

export async function closeTasksFor(tx: Tx, refType: string, refId: string) {
  await tx.task.updateMany({ where: { refType, refId, doneAt: null }, data: { doneAt: new Date() } });
}
