import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/** Cria um banco SQLite novo e descartável (prisma/test.db) para os testes de serviço. */
export default function setup() {
  for (const f of ["test.db", "test.db-journal"]) rmSync(path.join(__dirname, "..", "prisma", f), { force: true });
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
