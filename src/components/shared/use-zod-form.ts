"use client";

import { useForm, type UseFormProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/** useForm tipado com o schema Zod: campos = entrada do schema, onSubmit recebe a saída validada. */
export function useZodForm<S extends z.ZodType<unknown, unknown>>(
  schema: S,
  props?: Omit<UseFormProps<z.input<S> & Record<string, unknown>, unknown, z.output<S>>, "resolver">,
) {
  return useForm<z.input<S> & Record<string, unknown>, unknown, z.output<S>>({
    ...props,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as any,
  });
}

/** Mostra o primeiro erro de validação em um toast (útil para campos sem mensagem visível). */
export function toastFirstError(errors: Record<string, unknown>) {
  const find = (obj: unknown, path: string[] = []): { path: string; message: string } | null => {
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return { path: path.join("."), message: o.message };
    for (const [k, v] of Object.entries(o)) {
      if (k === "ref") continue;
      const r = find(v, [...path, k]);
      if (r) return r;
    }
    return null;
  };
  const first = find(errors);
  if (first) {
    import("sonner").then(({ toast }) => toast.error(`Verifique o formulário: ${first.message}`, { description: first.path }));
  }
}
