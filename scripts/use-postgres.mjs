// Troca o provider do Prisma de SQLite para PostgreSQL (deploy em Neon/Supabase/Vercel).
// Uso: npm run db:postgres  → depois configure DATABASE_URL=postgresql://... e rode npm run db:push
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../prisma/schema.prisma", import.meta.url);
const schema = readFileSync(file, "utf8");
const next = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
if (next === schema) {
  console.log("O schema já está configurado para PostgreSQL.");
} else {
  writeFileSync(file, next);
  console.log('✔ prisma/schema.prisma agora usa provider = "postgresql". Rode: npx prisma generate');
}
