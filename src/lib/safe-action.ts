import "server-only";
import { z } from "zod";
import { getUser, type SessionUser } from "./session";
import { can, type Permission } from "./permissions";

import { BusinessError } from "./errors";

export { BusinessError };

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Handler<I, R> = (input: I, ctx: { user: SessionUser }) => Promise<R>;

/**
 * Cria uma server action com: validação Zod no servidor, checagem de sessão/permissão
 * e tratamento uniforme de erros (retorna { ok, data | error } para o toast).
 */
export function action<S extends z.ZodType, R>(
  opts: { schema: S; permission?: Permission | Permission[] },
  handler: Handler<z.output<S>, R>,
) {
  return async (input: z.input<S>): Promise<ActionResult<R>> => {
    const user = await getUser();
    if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

    const perms = opts.permission ? (Array.isArray(opts.permission) ? opts.permission : [opts.permission]) : [];
    if (perms.length && !perms.some((p) => can(user.role, p))) {
      return { ok: false, error: "Você não tem permissão para esta ação." };
    }

    const parsed = opts.schema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      const first = parsed.error.issues[0];
      return { ok: false, error: first?.message ?? "Dados inválidos", fieldErrors };
    }

    try {
      const data = await handler(parsed.data, { user });
      return { ok: true, data };
    } catch (err) {
      if (err instanceof BusinessError) return { ok: false, error: err.message };
      const prismaCode = (err as { code?: string })?.code;
      if (prismaCode === "P2002") {
        const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
        return { ok: false, error: `Já existe um registro com este valor${target ? ` (${String(target)})` : ""}.` };
      }
      console.error("[action]", err);
      return { ok: false, error: "Erro inesperado. Tente novamente." };
    }
  };
}
