// Preços de referência (seminovo, menor capacidade, em reais) usados pela demonstração, simulação e
// pela sugestão inicial da tabela de avaliação de troca. Não afeta preços cadastrados nos aparelhos.

export const BASE_PRICE: Record<string, number> = {
  "iPhone 11": 1690, "iPhone 11 Pro": 2090, "iPhone 11 Pro Max": 2390,
  "iPhone 12 mini": 1890, "iPhone 12": 2290, "iPhone 12 Pro": 2890, "iPhone 12 Pro Max": 3290,
  "iPhone 13 mini": 2590, "iPhone 13": 2990, "iPhone 13 Pro": 3790, "iPhone 13 Pro Max": 4290,
  "iPhone 14": 3490, "iPhone 14 Plus": 3790, "iPhone 14 Pro": 4690, "iPhone 14 Pro Max": 5290,
  "iPhone 15": 4290, "iPhone 15 Plus": 4690, "iPhone 15 Pro": 5690, "iPhone 15 Pro Max": 6490,
  "iPhone 16": 5290, "iPhone 16 Plus": 5790, "iPhone 16 Pro": 6990, "iPhone 16 Pro Max": 7990, "iPhone 16e": 3990,
  "iPhone 17": 6490, "iPhone Air": 7990, "iPhone 17 Pro": 9490, "iPhone 17 Pro Max": 10690,
  // estimativa (lançamentos 2026): ajuste a tabela de avaliação em Configurações
  "iPhone 17e": 4490, "iPhone 18 Pro": 10490, "iPhone 18 Pro Max": 11690, "iPhone Duo": 13990,
};

/** Arredonda para preço "comercial" (ex.: 3.490,00). */
export function commercial(cents: number): number {
  const reais = Math.round(cents / 100);
  return (Math.round(reais / 50) * 50 - 10) * 100;
}

/** Preço de venda sugerido (centavos) por modelo, capacidade e condição. */
export function priceFor(model: string, capacities: string[], capacity: string, condition: string): number {
  const step = Math.max(capacities.indexOf(capacity), 0);
  let reais = (BASE_PRICE[model] ?? 3000) * (1 + step * 0.12);
  if (condition === "NOVO") reais *= 1.22;
  if (condition === "VITRINE") reais *= 1.1;
  if (condition === "RECONDICIONADO") reais *= 0.92;
  return commercial(reais * 100);
}
