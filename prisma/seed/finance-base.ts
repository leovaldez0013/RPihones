import type { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "../../src/features/finance/categories";

export const WARRANTY_CLAUSES = `A garantia NÃO cobre:
- danos causados por queda, impacto, pressão ou trincas na tela/traseira;
- contato com líquidos ou umidade (mesmo em aparelhos com resistência à água);
- desgaste natural da bateria após o período de garantia;
- aparelhos abertos, reparados ou modificados por terceiros;
- problemas de software causados por jailbreak, apps de terceiros ou atualizações interrompidas;
- acessórios que acompanham o aparelho, salvo garantia própria.`;

export async function seedFinanceBase(db: PrismaClient) {
  for (const c of DEFAULT_CATEGORIES) {
    await db.category.upsert({ where: { key: c.key }, update: {}, create: { ...c, system: true } });
  }

  const caixa = await db.financialAccount.create({ data: { name: "Caixa da loja", kind: "CAIXA", initialBalance: 50000 } });
  const banco = await db.financialAccount.create({ data: { name: "Banco — conta PJ", kind: "BANCO", initialBalance: 4500000 } });
  const maquininha = await db.financialAccount.create({ data: { name: "Maquininha", kind: "MAQUININHA", initialBalance: 0 } });

  // Taxas da maquininha (bandeira "TODAS"): débito, crédito 1x a 12x.
  // customerRatePct = juros totais repassados ao cliente (0 = sem juros até 3x).
  const credit = [3.19, 4.39, 5.09, 5.79, 6.49, 7.19, 7.89, 8.59, 9.29, 9.99, 10.69, 11.39];
  const customer = [0, 0, 0, 4.9, 6.1, 7.3, 8.5, 9.7, 10.9, 12.1, 13.3, 14.5];
  await db.cardFee.create({ data: { accountId: maquininha.id, brand: "TODAS", method: "DEBITO", installments: 1, feePct: 1.37, customerRatePct: 0, settlementDays: 1 } });
  for (let i = 1; i <= 12; i++) {
    await db.cardFee.create({
      data: { accountId: maquininha.id, brand: "TODAS", method: "CREDITO", installments: i, feePct: credit[i - 1], customerRatePct: customer[i - 1], settlementDays: 30 },
    });
  }

  const rules = [
    { condition: "NOVO", days: 365, clauses: "Garantia de 1 ano pela Apple a partir da data de compra. A loja auxilia no acionamento.\n" + WARRANTY_CLAUSES },
    { condition: "SEMINOVO", days: 90, clauses: WARRANTY_CLAUSES },
    { condition: "VITRINE", days: 180, clauses: WARRANTY_CLAUSES },
    { condition: "RECONDICIONADO", days: 90, clauses: WARRANTY_CLAUSES },
    { condition: "ACESSORIO", days: 90, clauses: "Garantia contra defeitos de fabricação. Não cobre mau uso, rasgos, quebras ou oxidação." },
    { condition: "SERVICO", days: 90, clauses: "Garantia do serviço executado e das peças trocadas. Não cobre novas quedas, líquidos ou outros defeitos." },
  ];
  for (const r of rules) await db.warrantyRule.upsert({ where: { condition: r.condition }, update: {}, create: r });

  return { caixa: caixa.id, banco: banco.id, maquininha: maquininha.id };
}
