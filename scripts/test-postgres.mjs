// Testa o sistema num PostgreSQL 17 portátil (sem instalar nada no Windows), como na Vercel + Neon/Supabase.
//   npm run test:postgres            → testes automáticos + seed de demonstração no Postgres; volta para SQLite
//   npm run test:postgres -- --serve → mesmo, e deixa o Postgres ligado com a demonstração para abrir o app
// Pare o servidor de desenvolvimento antes: o Prisma Client é trocado durante o teste.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 54329;
const BASE = `postgresql://postgres:postgres@localhost:${PORT}`;
const SCHEMA = "prisma/schema.postgres.prisma";
const serve = process.argv.includes("--serve");

const run = (cmd, env = {}) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
};

rmSync(".pg-test", { recursive: true, force: true });
const pg = new EmbeddedPostgres({ databaseDir: ".pg-test/data", user: "postgres", password: "postgres", port: PORT, persistent: false, onLog: () => {}, initdbFlags: ["--encoding=UTF8", "--locale=C"] }); // UTF-8 como no Neon/Supabase

let failed = false;
try {
  console.log("Iniciando PostgreSQL portátil…");
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("rp_test");
  await pg.createDatabase("rp_demo");

  // schema PostgreSQL + Prisma Client + tabelas (mesmo caminho do build da Vercel)
  run(`node scripts/prepare-db.mjs --out=${SCHEMA} --no-seed`, { DATABASE_URL: `${BASE}/rp_test` });
  run(`npx prisma db push --skip-generate --schema ${SCHEMA}`, { DATABASE_URL: `${BASE}/rp_demo`, DIRECT_URL: `${BASE}/rp_demo` });

  // 1) todos os testes automáticos
  run("npx vitest run", { TEST_DATABASE_URL: `${BASE}/rp_test`, DIRECT_URL: `${BASE}/rp_test` });
  // 2) seed limpo + seed de demonstração (6 meses de vendas, OS, encomendas, garantias…)
  run("npx tsx prisma/seed/index.ts --demo", { DATABASE_URL: `${BASE}/rp_demo`, DIRECT_URL: `${BASE}/rp_demo` });
  console.log("\n✅ PostgreSQL: testes e seed de demonstração concluídos.");
} catch (e) {
  failed = true;
  console.error("\n❌ Falhou no PostgreSQL:", e.message);
}

if (serve && !failed) {
  console.log(`\nPostgres ligado com a demonstração em ${BASE}/rp_demo (Ctrl+C para parar).`);
  const stop = async () => {
    await pg.stop();
    run("npx prisma generate");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await new Promise(() => {});
} else {
  await pg.stop();
  rmSync(".pg-test", { recursive: true, force: true });
  // volta o Prisma Client para o SQLite do desenvolvimento
  run("npx prisma generate");
  process.exit(failed ? 1 : 0);
}
