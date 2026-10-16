import type { Tx } from "./db";

export async function audit(
  tx: Tx,
  entry: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    summary?: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
    },
  });
}

/** Retorna só os campos alterados, para log enxuto. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = before[key];
    const next = after[key];
    const same = prev instanceof Date && next instanceof Date ? prev.getTime() === next.getTime() : prev === next;
    if (!same) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
