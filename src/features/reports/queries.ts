// Relatórios gerenciais. Cada relatório devolve colunas + linhas + resumo, usados pela tela
// (tabela com Excel/CSV) e pelo PDF.
import { db } from "@/lib/db";
import { abcCurve, marginPct, type Report } from "@/domain/reports";
import { DEVICE_CONDITION, PAYMENT_METHOD } from "@/domain/constants";

export const REPORTS = [
  { key: "vendas", label: "Vendas" },
  { key: "margem", label: "Margem por modelo" },
  { key: "abc", label: "Curva ABC" },
  { key: "giro", label: "Giro de estoque" },
  { key: "trocas", label: "Trocas recebidas" },
  { key: "pagamentos", label: "Formas de pagamento" },
  { key: "vendedores", label: "Vendedores" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

const DAY = 86400000;
const doneSales = (from: Date, to: Date) => ({ deletedAt: null, status: "CONCLUIDA", completedAt: { gte: from, lt: to } });

export async function buildReport(key: ReportKey, from: Date, to: Date): Promise<Report> {
  switch (key) {
    case "vendas": {
      const sales = await db.sale.findMany({ where: doneSales(from, to), include: { customer: true, seller: true, _count: { select: { items: true } } }, orderBy: { completedAt: "asc" } });
      const total = sales.reduce((a, s) => a + s.total, 0);
      const profit = sales.reduce((a, s) => a + s.total - s.cost - s.cardFees - s.commission, 0);
      return {
        key,
        title: "Vendas do período",
        description: "Vendas concluídas, com custo real, taxas de cartão, comissão e lucro.",
        columns: [
          { key: "numero", label: "Venda", format: "int" },
          { key: "data", label: "Data", format: "date" },
          { key: "cliente", label: "Cliente", format: "text" },
          { key: "vendedor", label: "Vendedor", format: "text" },
          { key: "itens", label: "Itens", format: "int" },
          { key: "total", label: "Total", format: "money" },
          { key: "custo", label: "Custo", format: "money" },
          { key: "taxas", label: "Taxas", format: "money" },
          { key: "lucro", label: "Lucro", format: "money" },
        ],
        rows: sales.map((s) => ({
          numero: s.number,
          data: s.completedAt!.toISOString(),
          cliente: s.customer?.name ?? "Consumidor",
          vendedor: s.seller.name,
          itens: s._count.items,
          total: s.total,
          custo: s.cost,
          taxas: s.cardFees,
          lucro: s.total - s.cost - s.cardFees - s.commission,
        })),
        summary: [
          { label: "Vendas", value: sales.length, format: "int" },
          { label: "Faturamento", value: total, format: "money" },
          { label: "Ticket médio", value: sales.length ? Math.round(total / sales.length) : 0, format: "money" },
          { label: "Lucro", value: profit, format: "money" },
        ],
      };
    }

    case "margem": {
      const items = await db.saleItem.findMany({
        where: { active: true, kind: "DEVICE", sale: doneSales(from, to) },
        select: { unitPrice: true, discount: true, unitCost: true, device: { select: { condition: true, model: { select: { name: true } } } } },
      });
      const map = new Map<string, { modelo: string; condicao: string; qtd: number; receita: number; custo: number }>();
      for (const i of items) {
        const k = `${i.device?.model.name}|${i.device?.condition}`;
        const r = map.get(k) ?? { modelo: i.device?.model.name ?? "—", condicao: DEVICE_CONDITION.label(i.device?.condition ?? ""), qtd: 0, receita: 0, custo: 0 };
        r.qtd++;
        r.receita += i.unitPrice - i.discount;
        r.custo += i.unitCost;
        map.set(k, r);
      }
      const rows = [...map.values()].map((r) => ({ ...r, lucro: r.receita - r.custo, margem: marginPct(r.receita, r.custo), medio: Math.round(r.receita / r.qtd) })).sort((a, b) => b.lucro - a.lucro);
      const rec = rows.reduce((a, r) => a + r.receita, 0);
      const cost = rows.reduce((a, r) => a + r.custo, 0);
      return {
        key,
        title: "Margem por modelo",
        description: "Aparelhos vendidos no período por modelo e condição. Custo = aquisição + OS internas.",
        columns: [
          { key: "modelo", label: "Modelo", format: "text" },
          { key: "condicao", label: "Condição", format: "text" },
          { key: "qtd", label: "Qtd", format: "int" },
          { key: "medio", label: "Preço médio", format: "money" },
          { key: "receita", label: "Receita", format: "money" },
          { key: "custo", label: "Custo", format: "money" },
          { key: "lucro", label: "Lucro bruto", format: "money" },
          { key: "margem", label: "Margem", format: "pct" },
        ],
        rows,
        summary: [
          { label: "Aparelhos", value: items.length, format: "int" },
          { label: "Receita", value: rec, format: "money" },
          { label: "Lucro bruto", value: rec - cost, format: "money" },
          { label: "Margem média", value: marginPct(rec, cost), format: "pct" },
        ],
      };
    }

    case "abc": {
      const items = await db.saleItem.findMany({
        where: { active: true, sale: doneSales(from, to) },
        select: { kind: true, description: true, quantity: true, unitPrice: true, discount: true, device: { select: { model: { select: { name: true } } } }, accessory: { select: { name: true } } },
      });
      const map = new Map<string, { produto: string; tipo: string; qtd: number; value: number }>();
      for (const i of items) {
        const name = i.kind === "DEVICE" ? (i.device?.model.name ?? i.description) : i.kind === "ACCESSORY" ? (i.accessory?.name ?? i.description) : i.description;
        const k = `${i.kind}|${name}`;
        const r = map.get(k) ?? { produto: name, tipo: i.kind === "DEVICE" ? "Aparelho" : i.kind === "ACCESSORY" ? "Acessório" : "Serviço", qtd: 0, value: 0 };
        r.qtd += i.quantity;
        r.value += i.unitPrice * i.quantity - i.discount;
        map.set(k, r);
      }
      const curve = abcCurve([...map.values()]);
      const count = (k: string) => curve.filter((c) => c.klass === k).length;
      return {
        key,
        title: "Curva ABC de produtos",
        description: "Classe A: produtos que somam 80% do faturamento; B: os próximos 15%; C: os 5% restantes.",
        columns: [
          { key: "classe", label: "Classe", format: "text" },
          { key: "produto", label: "Produto", format: "text" },
          { key: "tipo", label: "Tipo", format: "text" },
          { key: "qtd", label: "Qtd", format: "int" },
          { key: "receita", label: "Receita", format: "money" },
          { key: "part", label: "% do total", format: "pct" },
          { key: "acum", label: "% acumulado", format: "pct" },
        ],
        rows: curve.map((c) => ({ classe: c.klass, produto: c.produto, tipo: c.tipo, qtd: c.qtd, receita: c.value, part: c.share, acum: c.cumulative })),
        summary: [
          { label: "Produtos", value: curve.length, format: "int" },
          { label: "Classe A", value: count("A"), format: "int" },
          { label: "Classe B", value: count("B"), format: "int" },
          { label: "Classe C", value: count("C"), format: "int" },
        ],
      };
    }

    case "giro": {
      const [sold, stock] = await Promise.all([
        db.saleItem.findMany({
          where: { active: true, kind: "DEVICE", sale: doneSales(from, to) },
          select: { sale: { select: { completedAt: true } }, device: { select: { entryDate: true, model: { select: { name: true } } } } },
        }),
        db.device.findMany({ where: { deletedAt: null, status: { in: ["DISPONIVEL", "RESERVADO", "EM_MANUTENCAO", "EM_AVALIACAO"] } }, select: { entryDate: true, acquisitionCost: true, serviceCost: true, model: { select: { name: true } } } }),
      ]);
      const now = Date.now();
      const map = new Map<string, { modelo: string; vendidos: number; diasVenda: number; estoque: number; idade: number; valor: number }>();
      const get = (m: string) => map.get(m) ?? { modelo: m, vendidos: 0, diasVenda: 0, estoque: 0, idade: 0, valor: 0 };
      for (const s of sold) {
        const r = get(s.device!.model.name);
        r.vendidos++;
        r.diasVenda += Math.max(0, (s.sale.completedAt!.getTime() - s.device!.entryDate.getTime()) / DAY);
        map.set(r.modelo, r);
      }
      for (const d of stock) {
        const r = get(d.model.name);
        r.estoque++;
        r.idade += (now - d.entryDate.getTime()) / DAY;
        r.valor += d.acquisitionCost + d.serviceCost;
        map.set(r.modelo, r);
      }
      const periodDays = Math.max(1, (to.getTime() - from.getTime()) / DAY);
      const rows = [...map.values()]
        .map((r) => ({
          modelo: r.modelo,
          vendidos: r.vendidos,
          media: r.vendidos ? Math.round(r.diasVenda / r.vendidos) : null,
          estoque: r.estoque,
          idade: r.estoque ? Math.round(r.idade / r.estoque) : null,
          cobertura: r.vendidos ? Math.round(r.estoque / (r.vendidos / periodDays)) : null,
          valor: r.valor,
        }))
        .sort((a, b) => b.vendidos - a.vendidos || b.estoque - a.estoque);
      const totalSold = rows.reduce((a, r) => a + r.vendidos, 0);
      return {
        key,
        title: "Giro de estoque por modelo",
        description: "Vendidos no período, dias médios até vender, estoque atual, idade média e cobertura (dias de estoque no ritmo atual de vendas).",
        columns: [
          { key: "modelo", label: "Modelo", format: "text" },
          { key: "vendidos", label: "Vendidos", format: "int" },
          { key: "media", label: "Dias até vender", format: "days" },
          { key: "estoque", label: "Em estoque", format: "int" },
          { key: "idade", label: "Idade média", format: "days" },
          { key: "cobertura", label: "Cobertura", format: "days" },
          { key: "valor", label: "Valor em estoque (custo)", format: "money" },
        ],
        rows,
        summary: [
          { label: "Vendidos", value: totalSold, format: "int" },
          { label: "Em estoque", value: stock.length, format: "int" },
          { label: "Dias médios até vender", value: totalSold ? Math.round(rows.reduce((a, r) => a + (r.media ?? 0) * r.vendidos, 0) / totalSold) : 0, format: "days" },
          { label: "Valor em estoque", value: rows.reduce((a, r) => a + r.valor, 0), format: "money" },
        ],
      };
    }

    case "trocas": {
      const trades = await db.tradeIn.findMany({
        where: { deviceId: { not: null }, sale: doneSales(from, to) },
        include: { customer: true, sale: true, device: { select: { status: true, salePrice: true, model: { select: { name: true } }, capacity: true } } },
        orderBy: { createdAt: "asc" },
      });
      const total = trades.reduce((a, t) => a + t.finalValue, 0);
      return {
        key,
        title: "Aparelhos recebidos na troca",
        description: "Trocas das vendas concluídas no período: valor sugerido × pago e situação atual do aparelho.",
        columns: [
          { key: "data", label: "Data", format: "date" },
          { key: "venda", label: "Venda", format: "int" },
          { key: "cliente", label: "Cliente", format: "text" },
          { key: "aparelho", label: "Aparelho", format: "text" },
          { key: "bateria", label: "Bateria", format: "pct" },
          { key: "sugerido", label: "Sugerido", format: "money" },
          { key: "pago", label: "Valor pago", format: "money" },
          { key: "situacao", label: "Situação", format: "text" },
        ],
        rows: trades.map((t) => ({
          data: t.sale!.completedAt!.toISOString(),
          venda: t.sale!.number,
          cliente: t.customer?.name ?? "—",
          aparelho: t.device ? `${t.device.model.name} ${t.device.capacity}` : "—",
          bateria: t.batteryHealth,
          sugerido: t.suggestedValue,
          pago: t.finalValue,
          situacao: t.device?.status === "VENDIDO" ? "Revendido" : t.device?.status === "DISPONIVEL" ? "À venda" : "Em preparo",
        })),
        summary: [
          { label: "Trocas", value: trades.length, format: "int" },
          { label: "Total pago em trocas", value: total, format: "money" },
          { label: "Valor médio", value: trades.length ? Math.round(total / trades.length) : 0, format: "money" },
          { label: "Já revendidos", value: trades.filter((t) => t.device?.status === "VENDIDO").length, format: "int" },
        ],
      };
    }

    case "pagamentos": {
      const payments = await db.salePayment.findMany({ where: { sale: doneSales(from, to) }, select: { method: true, amount: true, installments: true, interest: true, feeAmount: true } });
      const map = new Map<string, { forma: string; qtd: number; valor: number; juros: number; taxas: number }>();
      for (const p of payments) {
        const label = p.method === "CREDITO_PARCELADO" ? `${PAYMENT_METHOD.label(p.method)}` : PAYMENT_METHOD.label(p.method);
        const r = map.get(p.method) ?? { forma: label, qtd: 0, valor: 0, juros: 0, taxas: 0 };
        r.qtd++;
        r.valor += p.amount;
        r.juros += p.interest;
        r.taxas += p.feeAmount;
        map.set(p.method, r);
      }
      const total = payments.reduce((a, p) => a + p.amount, 0);
      const rows = [...map.values()].map((r) => ({ ...r, part: total ? (r.valor / total) * 100 : 0 })).sort((a, b) => b.valor - a.valor);
      return {
        key,
        title: "Formas de pagamento",
        description: "Como os clientes pagaram as vendas do período (troca e sinal de encomenda incluídos).",
        columns: [
          { key: "forma", label: "Forma", format: "text" },
          { key: "qtd", label: "Pagamentos", format: "int" },
          { key: "valor", label: "Valor", format: "money" },
          { key: "part", label: "% do total", format: "pct" },
          { key: "juros", label: "Juros do cliente", format: "money" },
          { key: "taxas", label: "Taxas da maquininha", format: "money" },
        ],
        rows,
        summary: [
          { label: "Total recebido", value: total, format: "money" },
          { label: "Juros cobrados", value: rows.reduce((a, r) => a + r.juros, 0), format: "money" },
          { label: "Taxas pagas", value: rows.reduce((a, r) => a + r.taxas, 0), format: "money" },
        ],
      };
    }

    case "vendedores": {
      const sales = await db.sale.findMany({ where: doneSales(from, to), include: { seller: true } });
      const map = new Map<string, { vendedor: string; vendas: number; faturamento: number; descontos: number; comissao: number; lucro: number }>();
      for (const s of sales) {
        const r = map.get(s.sellerId) ?? { vendedor: s.seller.name, vendas: 0, faturamento: 0, descontos: 0, comissao: 0, lucro: 0 };
        r.vendas++;
        r.faturamento += s.total;
        r.descontos += s.itemDiscount + s.discount;
        r.comissao += s.commission;
        r.lucro += s.total - s.cost - s.cardFees - s.commission;
        map.set(s.sellerId, r);
      }
      const rows = [...map.values()].map((r) => ({ ...r, ticket: Math.round(r.faturamento / r.vendas) })).sort((a, b) => b.faturamento - a.faturamento);
      return {
        key,
        title: "Desempenho por vendedor",
        description: "Vendas concluídas no período por vendedor.",
        columns: [
          { key: "vendedor", label: "Vendedor", format: "text" },
          { key: "vendas", label: "Vendas", format: "int" },
          { key: "faturamento", label: "Faturamento", format: "money" },
          { key: "ticket", label: "Ticket médio", format: "money" },
          { key: "descontos", label: "Descontos dados", format: "money" },
          { key: "comissao", label: "Comissão", format: "money" },
          { key: "lucro", label: "Lucro gerado", format: "money" },
        ],
        rows,
        summary: [
          { label: "Vendedores", value: rows.length, format: "int" },
          { label: "Faturamento", value: rows.reduce((a, r) => a + r.faturamento, 0), format: "money" },
          { label: "Comissões", value: rows.reduce((a, r) => a + r.comissao, 0), format: "money" },
        ],
      };
    }
  }
}
