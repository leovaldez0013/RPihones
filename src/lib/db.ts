import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// ── Banco real × banco de simulação ──
// A simulação de 1 mês vive num arquivo separado (prisma/simulacao.db). Enquanto o modo simulação está
// ligado, o app inteiro lê e grava nele; os dados reais ficam intocados. O modo só vale dentro do servidor
// Next (scripts, seed e testes sempre usam o banco real).

const g = globalThis as unknown as { prisma?: PrismaClient; prismaSim?: PrismaClient; simMode?: boolean };

const realClient = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = realClient;

const PRISMA_DIR = path.join(process.cwd(), "prisma");
export const SIM_DB_FILE = path.join(PRISMA_DIR, "simulacao.db");
const SIM_FLAG_FILE = path.join(PRISMA_DIR, ".simulacao-ativa");

/** Simulação só funciona com o banco local (SQLite). */
export function simulationSupported() {
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}

/** Caminho do arquivo do banco real (SQLite), relativo à pasta prisma/ como o Prisma resolve. */
export function realDbFile() {
  return path.resolve(PRISMA_DIR, (process.env.DATABASE_URL ?? "file:./dev.db").slice("file:".length));
}

export function isSimulation(): boolean {
  if (!process.env.NEXT_RUNTIME || !simulationSupported()) return false;
  if (g.simMode === undefined) g.simMode = fs.existsSync(SIM_FLAG_FILE) && fs.existsSync(SIM_DB_FILE);
  return g.simMode;
}

export function setSimulationMode(on: boolean) {
  g.simMode = on;
  if (on) fs.writeFileSync(SIM_FLAG_FILE, new Date().toISOString());
  else if (fs.existsSync(SIM_FLAG_FILE)) fs.unlinkSync(SIM_FLAG_FILE);
}

export function simClient(): PrismaClient {
  g.prismaSim ??= new PrismaClient({ datasources: { db: { url: "file:./simulacao.db" } } });
  return g.prismaSim;
}

export async function closeSimClient() {
  if (g.prismaSim) await g.prismaSim.$disconnect();
  g.prismaSim = undefined;
}

export const realDb = realClient;

/** Cliente usado pelo app: aponta para o banco de simulação quando o modo está ligado. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = isSimulation() ? simClient() : realClient;
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

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
