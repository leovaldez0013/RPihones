// Seed de demonstração. Rodar com: npm run db:seed (em banco vazio) ou npm run db:reset (zera e popula).
import { PrismaClient } from "@prisma/client";
import { seedBase } from "./base";
import { seedAccessories, seedCatalog, seedDevices, seedSuppliers } from "./stock";
import { seedFinanceBase } from "./finance-base";
import { seedCustomers } from "./people";
import { seedOpenPurchases, seedPurchasesFromDevices } from "./purchases";

const db = new PrismaClient();

async function main() {
  if ((await db.device.count()) > 0) {
    console.log("O banco já tem dados. Para recriar a demonstração rode: npm run db:reset");
    return;
  }
  console.log("🌱 Populando banco de demonstração…");
  const ctx = await seedBase(db);
  console.log(`✔ ${Object.keys(ctx.users).length} usuários`);
  const accounts = await seedFinanceBase(db);
  console.log("✔ Plano de contas, contas financeiras, taxas da maquininha e garantias");
  const models = await seedCatalog(db);
  console.log(`✔ ${Object.keys(models).length} modelos de iPhone`);
  const suppliers = await seedSuppliers(db);
  const devices = await seedDevices(db, models, suppliers, ctx.users.gerente);
  console.log(`✔ ${devices.length} aparelhos`);
  const purchases = await seedPurchasesFromDevices(db, devices, ctx.users.gerente, accounts.banco);
  console.log(`✔ ${purchases} pedidos de compra recebidos (com contas a pagar)`);
  const accessories = await seedAccessories(db, ctx.users.gerente);
  console.log(`✔ ${Object.keys(accessories).length} acessórios/peças`);
  await seedOpenPurchases(db, ctx.users.gerente, suppliers, accessories);
  const customers = await seedCustomers(db);
  console.log(`✔ ${customers.length} clientes`);
  console.log("✅ Pronto! Login: admin@rpiphones.com.br / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
