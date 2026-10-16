// Modelos padrão (editáveis em Configurações → Documentos).
// Sintaxe: # Título, **negrito**, - listas, tabelas com |, --- linha, ->centralizado<-, {{variavel}}.

export const DEFAULT_TEMPLATES: Record<string, { name: string; content: string }> = {
  RECIBO: {
    name: "Recibo de venda",
    content: `# Recibo nº {{documento.numero}}

Recebemos de **{{cliente.nome}}**, CPF {{cliente.cpf}}, a importância de **{{venda.total}}** ({{venda.total_extenso}}), referente à venda nº {{venda.numero}} realizada em {{venda.data}}, dos itens abaixo:

{{venda.itens}}

**Subtotal:** {{venda.subtotal}} · **Descontos:** {{venda.desconto}} · **Total:** {{venda.total}}

**Formas de pagamento**

{{venda.formas_pagamento}}

Vendedor: {{venda.vendedor}}

Para clareza, firmamos o presente recibo.

->{{loja.cidade}}, {{data_hoje_extenso}}.

{{assinatura_loja}}

{{assinatura_cliente}}`,
  },

  GARANTIA: {
    name: "Termo de garantia",
    content: `# Termo de garantia

**Cliente:** {{cliente.nome}} · CPF {{cliente.cpf}} · {{cliente.telefone}}
**Venda nº:** {{venda.numero}} de {{venda.data}}

A **{{loja.nome}}** garante os produtos abaixo contra defeitos de funcionamento pelos prazos indicados, contados a partir da data da compra:

{{garantia.itens}}

## Condições da garantia

{{garantia.clausulas}}

## Como acionar

Entre em contato pelo WhatsApp {{loja.whatsapp}} ou compareça à loja com este termo e o aparelho. A análise técnica é feita em até 5 dias úteis. Aparelhos novos lacrados também contam com a garantia do fabricante (Apple), que pode ser acionada em qualquer assistência autorizada.

Declaro que recebi o(s) produto(s) em perfeito estado de funcionamento e que li e concordo com as condições acima.

->{{loja.cidade}}, {{data_hoje_extenso}}.

{{assinatura_cliente}}`,
  },

  TERMO_TROCA: {
    name: "Termo de recebimento de aparelho usado",
    content: `# Termo de recebimento de aparelho usado e declaração de procedência

Eu, **{{cliente.nome}}**, CPF **{{cliente.cpf}}**, residente em {{cliente.endereco}}, telefone {{cliente.telefone}}, declaro para os devidos fins que sou o legítimo proprietário do aparelho descrito abaixo e que o entrego à **{{loja.razao_social}}** (CNPJ {{loja.cnpj}}) **{{troca.finalidade}}**, pelo valor de **{{troca.valor}}** ({{troca.valor_extenso}}).

{{troca.aparelho}}

**Estado na avaliação:** bateria {{troca.bateria}} · grade {{troca.grade}}

{{troca.checklist}}

**Declaro ainda que:**

- o aparelho é de minha propriedade e **não é produto de furto, roubo, receptação** ou qualquer outro ilícito;
- não possui restrição de operadora, bloqueio por IMEI, financiamento ou alienação pendente;
- removi minha conta iCloud, desativei o "Buscar iPhone" e não tenho mais acesso remoto ao aparelho;
- estou ciente de que declaração falsa sujeita o declarante às penas da lei (art. 180 e art. 299 do Código Penal) e a ressarcir integralmente a loja.

{{troca.referencia}}

->{{loja.cidade}}, {{data_hoje_extenso}}.

{{assinatura_cliente}}

{{assinatura_loja}}`,
  },

  ENCOMENDA: {
    name: "Comprovante de encomenda e sinal",
    content: `# Comprovante de encomenda nº {{encomenda.numero}}

**Cliente:** {{cliente.nome}} · CPF {{cliente.cpf}} · {{cliente.telefone}}
**Data:** {{encomenda.data}}

## Aparelho desejado

| Modelo | Capacidade | Cor | Condição | Faixa de preço |
| --- | --- | --- | --- | --- |
| {{encomenda.modelo}} | {{encomenda.capacidade}} | {{encomenda.cor}} | {{encomenda.condicao}} | {{encomenda.faixa_preco}} |

**Sinal recebido:** {{encomenda.sinal}} ({{encomenda.forma_sinal}})
**Previsão:** {{encomenda.previsao}}

O sinal será abatido do valor total na entrega do aparelho. Caso a loja não consiga localizar o aparelho no prazo combinado, o sinal será devolvido integralmente. Em caso de desistência do cliente após a chegada do aparelho, o sinal poderá ser retido até o limite de 10% do valor do produto.

{{encomenda.observacoes}}

->{{loja.cidade}}, {{data_hoje_extenso}}.

{{assinatura_cliente}}

{{assinatura_loja}}`,
  },

  OS_ENTRADA: {
    name: "Ordem de serviço — entrada",
    content: `# Ordem de serviço nº {{os.numero}} — entrada

**Cliente:** {{cliente.nome}} · CPF {{cliente.cpf}} · {{cliente.telefone}}
**Entrada:** {{os.data}} · **Previsão:** {{os.prazo}} · **Prioridade:** {{os.prioridade}}

## Aparelho

{{os.aparelho}}

**Defeito relatado:** {{os.defeito}}
**Serviços previstos:** {{os.servicos}}
**Orçamento estimado:** {{os.valor}}

## Checklist de entrada

{{os.checklist}}

## Condições

- O orçamento pode ser alterado após o diagnóstico; nenhum serviço adicional será executado sem autorização.
- Aparelhos não retirados em até 90 dias após o aviso de conclusão poderão ser vendidos para cobrir custos (art. 1.275 do Código Civil).
- A loja não se responsabiliza por dados não salvos; recomendamos backup antes do reparo.

{{assinatura_cliente}}`,
  },

  OS_ENTREGA: {
    name: "Ordem de serviço — entrega",
    content: `# Ordem de serviço nº {{os.numero}} — entrega

**Cliente:** {{cliente.nome}} · {{cliente.telefone}}
**Aparelho:** {{os.aparelho}}
**Entrada:** {{os.data}} · **Entrega:** {{os.entrega}}

**Defeito relatado:** {{os.defeito}}
**Diagnóstico / serviço executado:** {{os.diagnostico}}

{{os.pecas}}

**Valor total:** {{os.valor}}

**Garantia do serviço:** {{garantia.dias}} dias, até {{garantia.ate}}.

{{garantia.clausulas}}

Declaro que recebi o aparelho funcionando e testado na minha presença.

{{assinatura_cliente}}`,
  },

  ORCAMENTO: {
    name: "Orçamento",
    content: `# Orçamento nº {{venda.numero}}

**Cliente:** {{cliente.nome}} · {{cliente.telefone}}
**Data:** {{venda.data}} · **Válido até:** {{venda.validade}}

{{venda.itens}}

**Total à vista:** {{venda.total}}

{{venda.troca}}

## Condições de pagamento

{{venda.parcelamento}}

Valores e disponibilidade sujeitos a alteração após a validade. Aparelhos reservados até a data de validade.

Atendido por {{venda.vendedor}} — {{loja.whatsapp}}`,
  },
};
