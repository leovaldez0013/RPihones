import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, type Permission } from "./permissions";

export type SessionUser = { id: string; name: string; email: string; role: string };

export async function getUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

/** Para páginas: redireciona para login ou para o dashboard se não tiver permissão. */
export async function requirePage(permission?: Permission): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/dashboard?negado=1");
  return user;
}
