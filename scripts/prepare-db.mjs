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

const url = process.env.DATABASE_URL ?? "";
const isPostgres = /^postgres(ql)?:\/\//.test(url);
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const out = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "prisma/schema.prisma";

if (!isPostgres) {
  console.log("[prepare-db] DATABASE_URL não é PostgreSQL — nada a fazer (SQLite local).");
  process.exit(0);
}

const schema = readFileSync("prisma/schema.prisma", "utf8");
let pg = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
if (process.env.DIRECT_URL && !/directUrl/.test(pg)) {
  pg = pg.replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")');
}
writeFileSync(out, pg);
console.log(`[prepare-db] schema PostgreSQL gravado em ${out}`);

const run = (cmd) => {
  console.log(`[prepare-db] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
};

run(`npx prisma generate --schema ${out}`);
if (!flag("no-push") && process.env.DB_PUSH_ON_BUILD !== "0") run(`npx prisma db push --skip-generate --schema ${out}`);
if (!flag("no-seed") && process.env.SEED_ON_BUILD !== "0") run("npx tsx prisma/seed/index.ts");
