// Seed de demonstração. Rodar com: npm run db:seed (em banco vazio) ou npm run db:reset (zera e popula).
import { PrismaClient } from "@prisma/client";
import { seedBase } from "./base";
import { seedAccessories, seedCatalog, seedDevices, seedSuppliers } from "./stock";

const db = new PrismaClient();

async function main() {
  if ((await db.device.count()) > 0) {
    console.log("O banco já tem dados. Para recriar a demonstração rode: npm run db:reset");
    return;
  }
  console.log("🌱 Populando banco de demonstração…");
  const ctx = await seedBase(db);
  console.log(`✔ ${Object.keys(ctx.users).length} usuários`);
  const models = await seedCatalog(db);
  console.log(`✔ ${Object.keys(models).length} modelos de iPhone`);
  const suppliers = await seedSuppliers(db);
  const devices = await seedDevices(db, models, suppliers, ctx.users.gerente);
  console.log(`✔ ${devices.length} aparelhos`);
  const accessories = await seedAccessories(db, ctx.users.gerente);
  console.log(`✔ ${Object.keys(accessories).length} acessórios/peças`);
  console.log("✅ Pronto! Login: admin@rpiphones.com.br / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
