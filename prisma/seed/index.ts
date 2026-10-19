// Seed. Padrão: banco limpo para uso real (usuários, loja, catálogo, taxas, configurações e acessórios).
// Com --demo (npm run db:seed:demo): 6 meses de dados fictícios para conhecer o sistema.
import { db } from "../../src/lib/db";
import { seedBase } from "./base";
import { seedAccessories, seedCatalog, seedDevices, seedSuppliers } from "./stock";
import { seedFinanceBase } from "./finance-base";
import { seedCustomers } from "./people";
import { seedOpenPurchases, seedPurchasesFromDevices } from "./purchases";
import { seedSalesHistory, seedTradeInTable } from "./sales";
import { seedFinanceHistory } from "./finance-history";
import { seedImeiChecks, seedOrders, seedServiceOrders } from "./service";


const DEMO = process.argv.includes("--demo");

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("O banco já tem dados. Para recriar rode: npm run db:reset (ou db:reset:demo)");
    return;
  }
  console.log(DEMO ? "🌱 Populando banco de DEMONSTRAÇÃO…" : "🌱 Preparando banco para uso (sem aparelhos, fornecedores, clientes ou movimentações)…");
  const ctx = await seedBase(db, { demo: DEMO });
  console.log(`✔ ${Object.keys(ctx.users).length} usuários`);
  const accounts = await seedFinanceBase(db, { demo: DEMO });
  console.log("✔ Plano de contas, contas financeiras, taxas da maquininha e garantias");
  const models = await seedCatalog(db, { demo: DEMO });
  console.log(`✔ ${Object.keys(models).length} modelos de iPhone`);
  await seedTradeInTable();
  console.log("✔ Tabela de avaliação de troca e regras de comissão");

  if (!DEMO) {
    const accessories = await seedAccessories(db, ctx.users.gerente);
    console.log(`✔ ${Object.keys(accessories).length} acessórios/peças`);
    console.log("✅ Pronto! Login: admin@rpiphones.com.br / admin123 — troque as senhas em Configurações → Usuários.");
    return;
  }

  const suppliers = await seedSuppliers(db);
  const devices = await seedDevices(db, models, suppliers, ctx.users.gerente, 330);
  console.log(`✔ ${devices.length} aparelhos`);
  const purchases = await seedPurchasesFromDevices(db, devices, ctx.users.gerente, accounts.banco);
  console.log(`✔ ${purchases} pedidos de compra recebidos (com contas a pagar)`);
  const accessories = await seedAccessories(db, ctx.users.gerente);
  console.log(`✔ ${Object.keys(accessories).length} acessórios/peças`);
  await seedOpenPurchases(db, ctx.users.gerente, suppliers, accessories);
  const customers = await seedCustomers(db);
  console.log(`✔ ${customers.length} clientes`);
  console.log("… gerando vendas dos últimos meses (pode levar 1–2 min)");
  const sales = await seedSalesHistory(ctx.users, customers, accounts.maquininha);
  console.log(`✔ ${sales.count} vendas (${sales.trades} com aparelho na troca)`);
  const fin = await seedFinanceHistory(accounts.banco, ctx.users.admin);
  console.log(`✔ ${fin} lançamentos de despesas e comissões`);
  const sos = await seedServiceOrders(ctx.users, customers);
  console.log(`✔ ${sos} ordens de serviço`);
  const orders = await seedOrders(ctx.users, customers);
  console.log(`✔ ${orders} encomendas`);
  const checks = await seedImeiChecks(ctx.users);
  console.log(`✔ ${checks} testes de IMEI (1 bloqueado, para demonstração)`);
  console.log("✅ Pronto! Login: admin@rpiphones.com.br / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
