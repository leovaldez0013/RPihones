import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function seedBase(db: PrismaClient) {
  await db.storeSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: "RP iPhones",
      legalName: "RP Comércio de Eletrônicos LTDA",
      cnpj: "11222333000181",
      phone: "11987654321",
      whatsapp: "11987654321",
      email: "contato@rpiphones.com.br",
      instagram: "@rpiphones",
      cep: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      complement: "Loja 12",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      staleStockDays: 45,
      imeiProvider: "mock",
    },
  });

  const users = [
    { key: "admin", name: "Admin Demo", email: "admin@rpiphones.com.br", password: "admin123", role: "ADMIN", commissionPct: 0, discountLimitPct: 100 },
    { key: "gerente", name: "Gabriela Gerente", email: "gerente@rpiphones.com.br", password: "gerente123", role: "GERENTE", commissionPct: 1, discountLimitPct: 15 },
    { key: "vendedor1", name: "Lucas Vendedor", email: "lucas@rpiphones.com.br", password: "vendedor123", role: "VENDEDOR", commissionPct: 2, discountLimitPct: 5 },
    { key: "vendedor2", name: "Marina Vendedora", email: "marina@rpiphones.com.br", password: "vendedor123", role: "VENDEDOR", commissionPct: 2, discountLimitPct: 5 },
    { key: "tecnico", name: "Tiago Técnico", email: "tecnico@rpiphones.com.br", password: "tecnico123", role: "TECNICO", commissionPct: 0, discountLimitPct: 0 },
  ] as const;

  const result: Record<string, string> = {};
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const saved = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        commissionPct: u.commissionPct,
        discountLimitPct: u.discountLimitPct,
      },
    });
    result[u.key] = saved.id;
  }

  return { users: result as Record<(typeof users)[number]["key"], string> };
}

export type SeedContext = Awaited<ReturnType<typeof seedBase>>;
