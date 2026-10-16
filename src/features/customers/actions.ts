"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, ci } from "@/lib/db";
import { action, BusinessError } from "@/lib/safe-action";
import { audit, diff } from "@/lib/audit";
import { customerSchema, supplierSchema } from "./schemas";

export const saveCustomer = action({ schema: customerSchema, permission: "customers.edit" }, async (input, { user }) => {
  const { id, ...data } = input;
  const saved = await db.$transaction(async (tx) => {
    if (data.cpf) {
      const dup = await tx.customer.findFirst({ where: { cpf: data.cpf, id: id ? { not: id } : undefined } });
      if (dup) throw new BusinessError(`CPF já cadastrado para ${dup.name}.`);
    }
    if (id) {
      const before = await tx.customer.findUniqueOrThrow({ where: { id } });
      const consentChanged = before.marketingConsent !== data.marketingConsent;
      const c = await tx.customer.update({
        where: { id },
        data: { ...data, ...(consentChanged ? { consentAt: data.marketingConsent ? new Date() : null } : {}) },
      });
      const d = diff(before as unknown as Record<string, unknown>, data);
      if (d.changed)
        await audit(tx, { userId: user.id, action: "customer.update", entity: "Customer", entityId: id, summary: `Cliente ${c.name} atualizado`, before: d.before, after: d.after });
      return c;
    }
    const c = await tx.customer.create({ data: { ...data, consentAt: data.marketingConsent ? new Date() : null } });
    await audit(tx, { userId: user.id, action: "customer.create", entity: "Customer", entityId: c.id, summary: `Cliente ${c.name} cadastrado` });
    return c;
  });
  revalidatePath("/clientes");
  return { id: saved.id, name: saved.name, cpf: saved.cpf, phone: saved.phone };
});

export const deleteCustomer = action({ schema: z.object({ id: z.string() }), permission: "customers.edit" }, async ({ id }, { user }) => {
  await db.$transaction(async (tx) => {
    const c = await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { userId: user.id, action: "customer.delete", entity: "Customer", entityId: id, summary: `Cliente ${c.name} excluído` });
  });
  revalidatePath("/clientes");
  return true;
});

/** Busca rápida para seletores (PDV, OS, encomendas). */
export const searchCustomers = action({ schema: z.object({ q: z.string() }), permission: "customers.view" }, async ({ q }) => {
  const term = q.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const rows = await db.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: ci(term) },
        ...(digits.length >= 3 ? [{ cpf: { contains: digits } }, { phone: { contains: digits } }] : []),
      ],
    },
    take: 8,
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, cpf: c.cpf, phone: c.phone, email: c.email }));
});

export const saveSupplier = action({ schema: supplierSchema, permission: "suppliers.edit" }, async (input, { user }) => {
  const { id, ...data } = input;
  const saved = await db.$transaction(async (tx) => {
    if (data.document) {
      const dup = await tx.supplier.findFirst({ where: { document: data.document, id: id ? { not: id } : undefined } });
      if (dup) throw new BusinessError(`Documento já cadastrado para ${dup.name}.`);
    }
    const s = id ? await tx.supplier.update({ where: { id }, data }) : await tx.supplier.create({ data });
    await audit(tx, { userId: user.id, action: id ? "supplier.update" : "supplier.create", entity: "Supplier", entityId: s.id, summary: `Fornecedor ${s.name}` });
    return s;
  });
  revalidatePath("/fornecedores");
  return { id: saved.id, name: saved.name };
});

export const deleteSupplier = action({ schema: z.object({ id: z.string() }), permission: "suppliers.edit" }, async ({ id }, { user }) => {
  await db.$transaction(async (tx) => {
    const s = await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { userId: user.id, action: "supplier.delete", entity: "Supplier", entityId: id, summary: `Fornecedor ${s.name} excluído` });
  });
  revalidatePath("/fornecedores");
  return true;
});
