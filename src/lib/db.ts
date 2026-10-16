import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Próximo número de uma sequência (venda, OS, documentos...). Deve rodar dentro de transação. */
export async function nextSequence(tx: Tx, key: string): Promise<number> {
  const seq = await tx.sequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return seq.value;
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const IS_POSTGRES = (process.env.DATABASE_URL ?? "").startsWith("postgres");

/** Filtro "contém" sem diferenciar maiúsculas (SQLite já é case-insensitive em LIKE; no Postgres usa mode). */
export function ci(value: string) {
  return (IS_POSTGRES ? { contains: value, mode: "insensitive" } : { contains: value }) as { contains: string };
}
