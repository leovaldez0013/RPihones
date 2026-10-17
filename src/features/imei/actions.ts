"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action } from "@/lib/safe-action";
import { audit } from "@/lib/audit";
import { checkImei } from "./service";
import { resolveProvider } from "./providers";

export const checkImeiAction = action(
  { schema: z.object({ imei: z.string(), deviceId: z.string().optional().nullable() }), permission: "imei.check" },
  async (input, { user }) => {
    const r = await checkImei(db, input, user.id);
    revalidatePath("/imei");
    if (r.device) revalidatePath(`/estoque/aparelhos/${r.device.id}`);
    return r;
  },
);

const imeiSettingsSchema = z.object({
  provider: z.enum(["none", "mock", "http"]),
  apiUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || /^https?:\/\//.test(v), "O endereço deve começar com http:// ou https://"),
  /** vazio = mantém a chave atual */
  apiKey: z.string().trim().optional(),
  clearKey: z.boolean().default(false),
});

export const saveImeiSettings = action({ schema: imeiSettingsSchema, permission: "settings.store" }, async (input, { user }) => {
  const current = await db.storeSettings.findUnique({ where: { id: "default" } });
  const apiKey = input.clearKey ? null : input.apiKey || current?.imeiApiKey || null;
  // valida a combinação antes de salvar (ex.: HTTP sem endereço e sem .env)
  resolveProvider({ provider: input.provider, apiUrl: input.apiUrl, apiKey });
  await db.$transaction(async (tx) => {
    await tx.storeSettings.update({ where: { id: "default" }, data: { imeiProvider: input.provider, imeiApiUrl: input.apiUrl, imeiApiKey: apiKey } });
    // a chave nunca vai para o log
    await audit(tx, { userId: user.id, action: "settings.imei", entity: "StoreSettings", after: { provider: input.provider, apiUrl: input.apiUrl, keyChanged: !!input.apiKey || input.clearKey } });
  });
  revalidatePath("/configuracoes/geral");
  revalidatePath("/imei");
  return true;
});
