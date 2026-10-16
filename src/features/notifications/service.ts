import type { Tx } from "@/lib/db";

export async function notify(
  tx: Tx,
  n: { userId?: string | null; type: string; title: string; body?: string; href?: string },
) {
  await tx.notification.create({
    data: { userId: n.userId ?? null, type: n.type, title: n.title, body: n.body, href: n.href },
  });
}
