// Prepara o banco antes do build. Com DATABASE_URL de PostgreSQL (Vercel + Neon/Supabase):
//   1. converte o schema do Prisma para PostgreSQL (o arquivo do repositório continua SQLite, para o
//      desenvolvimento local);
//   2. gera o Prisma Client;
//   3. aplica o schema no banco (prisma db push — recusa mudanças que apagariam dados);
//   4. roda o seed inicial (só cria usuários, loja e catálogo se o banco estiver vazio).
// Com SQLite não faz nada.
//
// Uso: node scripts/prepare-db.mjs [--out=prisma/schema.postgres.prisma] [--no-push] [--no-seed]
// Variáveis: DB_PUSH_ON_BUILD=0 e SEED_ON_BUILD=0 desligam os passos 3 e 4; DIRECT_URL (opcional) é a
// conexão direta usada pelo db push quando DATABASE_URL aponta para um pooler.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { directDatabaseUrl, isPostgresUrl, normalizeDatabaseUrl } from "../src/lib/db-url.mjs";

const url = process.env.DATABASE_URL ?? "";
const isPostgres = isPostgresUrl(url);
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const out = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "prisma/schema.prisma";

if (!isPostgres) {
  console.log("[prepare-db] DATABASE_URL não é PostgreSQL — nada a fazer (SQLite local).");
  process.exit(0);
}

const schema = readFileSync("prisma/schema.prisma", "utf8");
let pg = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
// conexão direta para criar tabelas: DIRECT_URL, se informada; senão, derivada da DATABASE_URL (sem "-pooler")
if (!/directUrl/.test(pg)) {
  pg = pg.replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")');
}
writeFileSync(out, pg);
console.log(`[prepare-db] schema PostgreSQL gravado em ${out}`);

const env = {
  ...process.env,
  DATABASE_URL: normalizeDatabaseUrl(url),
  DIRECT_URL: process.env.DIRECT_URL ? normalizeDatabaseUrl(process.env.DIRECT_URL) : directDatabaseUrl(url),
};
const run = (cmd) => {
  console.log(`[prepare-db] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
};

run(`npx prisma generate --schema ${out}`);
if (!flag("no-push") && process.env.DB_PUSH_ON_BUILD !== "0") {
  run(`npx prisma db push --skip-generate --schema ${out}`);
  await syncSimulationSchema();
}
if (!flag("no-seed") && process.env.SEED_ON_BUILD !== "0") run("npx tsx prisma/seed/index.ts");

/** Se há uma simulação guardada (schema "simulacao"), aplica nela as mesmas mudanças de estrutura. */
async function syncSimulationSchema() {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  let exists = false;
  try {
    exists = (await client.$queryRawUnsafe("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'simulacao'")).length > 0;
  } finally {
    await client.$disconnect();
  }
  if (!exists) return;
  const withSchema = (raw) => {
    const u = new URL(raw);
    u.searchParams.set("schema", "simulacao");
    return u.toString();
  };
  try {
    console.log("[prepare-db] atualizando a estrutura da simulação guardada");
    execSync(`npx prisma db push --skip-generate --schema ${out}`, { stdio: "inherit", env: { ...env, DATABASE_URL: withSchema(env.DATABASE_URL), DIRECT_URL: withSchema(env.DIRECT_URL) } });
  } catch {
    // não impede o deploy: os dados reais já estão em dia; basta gerar a simulação de novo
    console.warn("[prepare-db] não foi possível atualizar a simulação guardada — gere uma nova em Simulação.");
  }
}
