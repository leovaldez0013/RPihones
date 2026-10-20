import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { directDatabaseUrl, isPostgresUrl, normalizeDatabaseUrl } from "./db-url.mjs";

// ── Banco real × banco de simulação ──
// A simulação de 1 mês fica separada dos dados reais: no SQLite (desenvolvimento) num arquivo à parte
// (prisma/simulacao.db); no PostgreSQL (Vercel + Neon) no schema "simulacao" do mesmo banco. Enquanto o
// modo simulação está ligado, o app inteiro lê e grava nela; os dados reais ficam intocados. O modo só vale
// dentro do servidor Next (scripts, seed e testes sempre usam o banco real).

const g = globalThis as unknown as { prisma?: PrismaClient; prismaSim?: PrismaClient; simMode?: boolean; simCheckedAt?: number };

// PostgreSQL (produção): a URL colada do Neon é ajustada para o Prisma (pooler, sem channel_binding)
const databaseUrl = process.env.DATABASE_URL;
const IS_POSTGRES = isPostgresUrl(databaseUrl);
if (IS_POSTGRES && !process.env.DIRECT_URL) process.env.DIRECT_URL = directDatabaseUrl(databaseUrl!);
const realClient = g.prisma ?? (IS_POSTGRES ? new PrismaClient({ datasources: { db: { url: normalizeDatabaseUrl(databaseUrl!) } } }) : new PrismaClient());
if (process.env.NODE_ENV !== "production") g.prisma = realClient;

const PRISMA_DIR = path.join(process.cwd(), "prisma");
export const SIM_DB_FILE = path.join(PRISMA_DIR, "simulacao.db");
const SIM_FLAG_FILE = path.join(PRISMA_DIR, ".simulacao-ativa");
/** Schema do PostgreSQL que guarda a simulação. */
export const SIM_SCHEMA = "simulacao";
// no PostgreSQL o modo é lido do banco (vale para todas as instâncias da Vercel), com este cache curto
const PG_MODE_TTL = 3000;

export function simulationBackend(): "sqlite" | "postgres" {
  return IS_POSTGRES ? "postgres" : "sqlite";
}

export function simulationSupported() {
  return IS_POSTGRES || (process.env.DATABASE_URL ?? "").startsWith("file:");
}

/** Caminho do arquivo do banco real (SQLite), relativo à pasta prisma/ como o Prisma resolve. */
export function realDbFile() {
  return path.resolve(PRISMA_DIR, (process.env.DATABASE_URL ?? "file:./dev.db").slice("file:".length));
}

/** Estado conhecido agora (sem ir ao banco). No PostgreSQL, prefira simulationActive(). */
export function isSimulation(): boolean {
  if (!process.env.NEXT_RUNTIME || !simulationSupported()) return false;
  if (IS_POSTGRES) return g.simMode ?? false;
  if (g.simMode === undefined) g.simMode = fs.existsSync(SIM_FLAG_FILE) && fs.existsSync(SIM_DB_FILE);
  return g.simMode;
}

/** O modo simulação está ligado? (no PostgreSQL consulta o banco real, com cache de poucos segundos) */
export async function simulationActive(): Promise<boolean> {
  if (!process.env.NEXT_RUNTIME || !IS_POSTGRES) return isSimulation();
  if (g.simMode === undefined || Date.now() - (g.simCheckedAt ?? 0) > PG_MODE_TTL) {
    const state = await realClient.simulationState.findUnique({ where: { id: "default" } }).catch(() => null);
    g.simMode = !!state?.active;
    g.simCheckedAt = Date.now();
  }
  return g.simMode;
}

export async function setSimulationMode(on: boolean) {
  g.simMode = on;
  if (IS_POSTGRES) {
    g.simCheckedAt = Date.now();
    await realClient.simulationState.upsert({ where: { id: "default" }, create: { active: on }, update: { active: on } });
    return;
  }
  if (on) fs.writeFileSync(SIM_FLAG_FILE, new Date().toISOString());
  else if (fs.existsSync(SIM_FLAG_FILE)) fs.unlinkSync(SIM_FLAG_FILE);
}

function simUrl() {
  if (!IS_POSTGRES) return "file:./simulacao.db";
  const u = new URL(normalizeDatabaseUrl(databaseUrl!));
  u.searchParams.set("schema", SIM_SCHEMA);
  return u.toString();
}

export function simClient(): PrismaClient {
  g.prismaSim ??= new PrismaClient({ datasources: { db: { url: simUrl() } } });
  return g.prismaSim;
}

export async function closeSimClient() {
  if (g.prismaSim) await g.prismaSim.$disconnect();
  g.prismaSim = undefined;
}

export const realDb = realClient;

async function currentClient() {
  return (await simulationActive()) ? simClient() : realClient;
}

type AnyFn = (...args: unknown[]) => unknown;

/** Cliente usado pelo app: aponta para a simulação quando o modo está ligado. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    if (IS_POSTGRES && process.env.NEXT_RUNTIME) {
      // PostgreSQL: o modo vem do banco (assíncrono), então cada chamada escolhe o cliente na hora
      const sample = Reflect.get(realClient, prop);
      if (typeof sample === "function") return (...args: unknown[]) => currentClient().then((c) => (Reflect.get(c, prop) as AnyFn).apply(c, args));
      if (sample && typeof sample === "object") {
        return new Proxy({}, {
          get: (_d, method) => (...args: unknown[]) =>
            currentClient().then((c) => {
              const delegate = Reflect.get(c, prop) as object;
              return (Reflect.get(delegate, method) as AnyFn).apply(delegate, args);
            }),
        });
      }
      return sample;
    }
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

/** Filtro "contém" sem diferenciar maiúsculas (SQLite já é case-insensitive em LIKE; no Postgres usa mode). */
export function ci(value: string) {
  return (IS_POSTGRES ? { contains: value, mode: "insensitive" } : { contains: value }) as { contains: string };
}
