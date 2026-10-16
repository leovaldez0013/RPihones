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
