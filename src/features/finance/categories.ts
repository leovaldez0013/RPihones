// Plano de contas padrão. `key` identifica as categorias usadas automaticamente pelo sistema.
// dreGroup define onde a categoria entra na DRE; ESTOQUE e TRANSFERENCIA ficam fora da DRE
// (compras viram custo só quando o produto é vendido — CMV calculado pelas vendas).

export type DefaultCategory = { key: string; name: string; kind: "RECEITA" | "DESPESA"; dreGroup: string };

export const DRE_GROUPS: Record<string, string> = {
  RECEITA_VENDAS: "Receita de vendas",
  RECEITA_SERVICOS: "Receita de serviços",
  DEDUCOES: "Deduções (devoluções/estornos)",
  CMV: "Custo das mercadorias vendidas",
  TAXAS: "Taxas de cartão",
  COMISSOES: "Comissões",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  OUTRAS: "Outras receitas/despesas",
  ESTOQUE: "Estoque (fora da DRE)",
  TRANSFERENCIA: "Transferências/adiantamentos (fora da DRE)",
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { key: "VENDA_APARELHO", name: "Venda de aparelhos", kind: "RECEITA", dreGroup: "RECEITA_VENDAS" },
  { key: "VENDA_ACESSORIO", name: "Venda de acessórios", kind: "RECEITA", dreGroup: "RECEITA_VENDAS" },
  { key: "SERVICO", name: "Serviços / ordens de serviço", kind: "RECEITA", dreGroup: "RECEITA_SERVICOS" },
  { key: "SINAL", name: "Sinal de encomenda (adiantamento)", kind: "RECEITA", dreGroup: "TRANSFERENCIA" },
  { key: "OUTRAS_RECEITAS", name: "Outras receitas", kind: "RECEITA", dreGroup: "OUTRAS" },
  { key: "SUPRIMENTO", name: "Suprimento de caixa", kind: "RECEITA", dreGroup: "TRANSFERENCIA" },
  { key: "ESTORNO", name: "Estornos e devoluções", kind: "DESPESA", dreGroup: "DEDUCOES" },
  { key: "COMPRA_MERCADORIA", name: "Compra de mercadorias", kind: "DESPESA", dreGroup: "ESTOQUE" },
  { key: "COMPRA_USADO", name: "Compra de aparelho usado (PF)", kind: "DESPESA", dreGroup: "ESTOQUE" },
  { key: "TAXA_CARTAO", name: "Taxas de cartão", kind: "DESPESA", dreGroup: "TAXAS" },
  { key: "COMISSAO", name: "Comissões de vendedores", kind: "DESPESA", dreGroup: "COMISSOES" },
  { key: "SANGRIA", name: "Sangria de caixa", kind: "DESPESA", dreGroup: "TRANSFERENCIA" },
  { key: "ALUGUEL", name: "Aluguel e condomínio", kind: "DESPESA", dreGroup: "DESPESA_OPERACIONAL" },
  { key: "SALARIOS", name: "Salários e encargos", kind: "DESPESA", dreGroup: "DESPESA_OPERACIONAL" },
  { key: "MARKETING", name: "Marketing e anúncios", kind: "DESPESA", dreGroup: "DESPESA_OPERACIONAL" },
  { key: "UTILIDADES", name: "Energia, água e internet", kind: "DESPESA", dreGroup: "DESPESA_OPERACIONAL" },
  { key: "IMPOSTOS", name: "Impostos e taxas", kind: "DESPESA", dreGroup: "DESPESA_OPERACIONAL" },
  { key: "SISTEMAS", name: "Sistemas e assinaturas", kind: "DESPESA", dreGroup: "DESPESA_OPERACIONAL" },
  { key: "PECAS_TERCEIROS", name: "Peças e serviços terceirizados", kind: "DESPESA", dreGroup: "DESPESA_OPERACIONAL" },
  { key: "OUTRAS_DESPESAS", name: "Outras despesas", kind: "DESPESA", dreGroup: "OUTRAS" },
];
