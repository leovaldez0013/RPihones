import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";
import { can, type Permission } from "./permissions";

export type SessionUser = { id: string; name: string; email: string; role: string };

/**
 * Usuário logado, conferido no banco a cada requisição: quem for desativado (ou removido)
 * perde o acesso na hora, e o perfil vale sempre o mais atual.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, active: true, deletedAt: true },
  });
  if (!u || !u.active || u.deletedAt) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
});

/** Para páginas: redireciona para login ou para o dashboard se não tiver permissão. */
export async function requirePage(permission?: Permission): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/dashboard?negado=1");
  return user;
}
