// Adiciona ao banco os modelos novos do catálogo (prisma/data/catalog.ts) e o valor base de troca deles,
// sem apagar nem alterar o que já existe. Uso: npm run catalog:sync
import { db } from "../src/lib/db";
import { CATALOG } from "../prisma/data/catalog";
import { seedTradeInPrices } from "../prisma/seed/sales";

async function main() {
  const existing = new Set((await db.deviceModel.findMany({ select: { name: true } })).map((m) => m.name));
  const added: string[] = [];
  for (const [i, m] of CATALOG.entries()) {
    if (existing.has(m.name)) continue;
    await db.deviceModel.create({ data: { ...m, colors: JSON.stringify(m.colors), capacities: JSON.stringify(m.capacities), sortOrder: i } });
    added.push(m.name);
  }
  const prices = await seedTradeInPrices();
  console.log(added.length ? `✔ Modelos adicionados: ${added.join(", ")}` : "✔ Catálogo já estava atualizado");
  console.log(`✔ ${prices} valores de troca criados (revise em Configurações → Avaliação de troca)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
