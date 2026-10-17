"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { audit } from "@/lib/audit";
import { optionalString, zDate } from "@/lib/validators";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/domain/marketing";
import { canMessage } from "./service";

/** Registra o envio pelo WhatsApp (o link wa.me é aberto no navegador) e conclui a tarefa, se houver. */
export const logSendAction = action(
  { schema: z.object({ customerId: z.string(), templateKey: z.string(), message: z.string().min(1), taskId: z.string().optional() }), permission: "marketing.view" },
  async (input, { user }) => {
    const c = await db.customer.findUniqueOrThrow({ where: { id: input.customerId } });
    if (!canMessage(input.templateKey, c.marketingConsent)) throw new BusinessError(`${c.name} não autorizou mensagens de marketing (LGPD).`);
    await db.$transaction(async (tx) => {
      await tx.campaignSend.create({ data: { customerId: c.id, templateKey: input.templateKey, message: input.message, userId: user.id } });
      if (input.taskId) await tx.task.update({ where: { id: input.taskId }, data: { doneAt: new Date() } });
    });
    revalidatePath("/marketing");
    return true;
  },
);

export const setTaskDoneAction = action({ schema: z.object({ id: z.string(), done: z.boolean() }), permission: "marketing.view" }, async ({ id, done }) => {
  await db.task.update({ where: { id }, data: { doneAt: done ? new Date() : null } });
  revalidatePath("/marketing");
  revalidatePath("/dashboard");
  return true;
});

export const createTaskAction = action(
  { schema: z.object({ title: z.string().trim().min(3, "Descreva a tarefa"), customerId: optionalString, dueDate: zDate }), permission: "marketing.view" },
  async (input, { user }) => {
    await db.task.create({ data: { type: "MANUAL", title: input.title, customerId: input.customerId, userId: user.id, dueDate: input.dueDate ?? new Date() } });
    revalidatePath("/marketing");
    return true;
  },
);

const KEYS = DEFAULT_MESSAGE_TEMPLATES.map((t) => t.key) as [string, ...string[]];

export const saveMessageTemplateAction = action(
  { schema: z.object({ key: z.enum(KEYS), name: z.string().trim().min(2), content: z.string().trim().min(5, "Mensagem muito curta").max(1500) }), permission: "settings.operational" },
  async (input, { user }) => {
    await db.$transaction(async (tx) => {
      await tx.messageTemplate.upsert({ where: { key: input.key }, create: input, update: { name: input.name, content: input.content } });
      await audit(tx, { userId: user.id, action: "message_template.save", entity: "MessageTemplate", entityId: input.key, summary: `Modelo de mensagem “${input.name}” salvo` });
    });
    revalidatePath("/marketing");
    return true;
  },
);

export const resetMessageTemplateAction = action({ schema: z.object({ key: z.enum(KEYS) }), permission: "settings.operational" }, async ({ key }, { user }) => {
  await db.messageTemplate.deleteMany({ where: { key } });
  await audit(db, { userId: user.id, action: "message_template.reset", entity: "MessageTemplate", entityId: key, summary: `Modelo de mensagem ${key} restaurado ao padrão` });
  revalidatePath("/marketing");
  return true;
});
