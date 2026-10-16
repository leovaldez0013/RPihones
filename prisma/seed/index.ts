// Seed de demonstração. Rodar com: npm run db:seed (ou npm run db:reset para zerar e popular).
import { PrismaClient } from "@prisma/client";
import { seedBase } from "./base";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Populando banco de demonstração…");
  const ctx = await seedBase(db);
  console.log(`✔ Base: ${Object.keys(ctx.users).length} usuários`);
  console.log("✅ Pronto! Login: admin@rpiphones.com.br / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
