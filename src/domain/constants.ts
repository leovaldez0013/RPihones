// Constantes de domínio: status, tipos e rótulos em pt-BR.
// Os valores são gravados como String no banco e validados aqui.

export type Tone = "gray" | "green" | "blue" | "amber" | "red" | "purple" | "teal" | "pink";

type Option<T extends string> = { value: T; label: string; tone?: Tone };

function options<const T extends string>(list: readonly Option<T>[]) {
  const values = list.map((o) => o.value) as unknown as readonly [T, ...T[]];
  const byValue = Object.fromEntries(list.map((o) => [o.value, o])) as Record<T, Option<T>>;
  return {
    list,
    values,
    label: (v: string | null | undefined) => (v && byValue[v as T]?.label) || v || "—",
    tone: (v: string | null | undefined): Tone => (v && byValue[v as T]?.tone) || "gray",
  };
}

export const ROLES = options([
  { value: "ADMIN", label: "Administrador", tone: "purple" },
  { value: "GERENTE", label: "Gerente", tone: "blue" },
  { value: "VENDEDOR", label: "Vendedor", tone: "green" },
  { value: "TECNICO", label: "Técnico", tone: "amber" },
]);
export type Role = (typeof ROLES.values)[number];

export const DEVICE_STATUS = options([
  { value: "DISPONIVEL", label: "Em estoque", tone: "green" },
  { value: "RESERVADO", label: "Reservado", tone: "amber" },
  { value: "VENDIDO", label: "Vendido", tone: "gray" },
  { value: "EM_MANUTENCAO", label: "Em manutenção", tone: "purple" },
  { value: "EM_AVALIACAO", label: "Em avaliação/preparação", tone: "blue" },
  { value: "DEVOLVIDO", label: "Devolvido", tone: "red" },
]);
export type DeviceStatus = (typeof DEVICE_STATUS.values)[number];

export const DEVICE_CONDITION = options([
  { value: "NOVO", label: "Novo lacrado", tone: "teal" },
  { value: "SEMINOVO", label: "Seminovo", tone: "blue" },
  { value: "VITRINE", label: "Vitrine", tone: "purple" },
  { value: "RECONDICIONADO", label: "Recondicionado", tone: "amber" },
]);
export type DeviceCondition = (typeof DEVICE_CONDITION.values)[number];

export const GRADES = options([
  { value: "A+", label: "A+ (impecável)", tone: "green" },
  { value: "A", label: "A (mínimos sinais)", tone: "teal" },
  { value: "B", label: "B (sinais de uso)", tone: "amber" },
  { value: "C", label: "C (marcas visíveis)", tone: "red" },
]);

export const DEVICE_ORIGIN = options([
  { value: "COMPRA", label: "Compra de fornecedor" },
  { value: "TROCA", label: "Troca (upgrade)" },
  { value: "COMPRA_PF", label: "Compra de pessoa física" },
  { value: "AJUSTE", label: "Ajuste/cadastro manual" },
]);

export const ACCESSORY_CATEGORY = options([
  { value: "CAPA", label: "Capa" },
  { value: "PELICULA", label: "Película" },
  { value: "CARREGADOR", label: "Carregador" },
  { value: "CABO", label: "Cabo" },
  { value: "FONE", label: "Fone" },
  { value: "AIRPODS", label: "AirPods" },
  { value: "WATCH", label: "Apple Watch" },
  { value: "PECA", label: "Peça (OS)" },
  { value: "OUTRO", label: "Outro" },
]);

export const STOCK_MOVEMENT = options([
  { value: "ENTRADA", label: "Entrada", tone: "green" },
  { value: "SAIDA", label: "Saída", tone: "blue" },
  { value: "AJUSTE", label: "Ajuste", tone: "amber" },
  { value: "PERDA", label: "Perda", tone: "red" },
]);

export const PURCHASE_STATUS = options([
  { value: "RASCUNHO", label: "Rascunho", tone: "gray" },
  { value: "PEDIDO", label: "Pedido feito", tone: "blue" },
  { value: "RECEBIDO_PARCIAL", label: "Recebido parcial", tone: "amber" },
  { value: "RECEBIDO", label: "Recebido", tone: "green" },
  { value: "CANCELADO", label: "Cancelado", tone: "red" },
]);

export const SALE_STATUS = options([
  { value: "ORCAMENTO", label: "Orçamento", tone: "blue" },
  { value: "CONCLUIDA", label: "Concluída", tone: "green" },
  { value: "CANCELADA", label: "Cancelada", tone: "red" },
  { value: "DEVOLVIDA", label: "Devolvida", tone: "amber" },
]);

export const PAYMENT_METHOD = options([
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito à vista" },
  { value: "CREDITO_PARCELADO", label: "Crédito parcelado" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CREDIARIO", label: "Crediário próprio" },
  { value: "TROCA", label: "Aparelho na troca" },
  { value: "SINAL", label: "Sinal de encomenda" },
]);
export type PaymentMethod = (typeof PAYMENT_METHOD.values)[number];

export const CARD_BRANDS = ["TODAS", "VISA", "MASTER", "ELO", "AMEX", "HIPER"] as const;

export const ORDER_STATUS = options([
  { value: "ABERTA", label: "Aberta", tone: "blue" },
  { value: "EM_BUSCA", label: "Em busca", tone: "purple" },
  { value: "CHEGOU", label: "Chegou", tone: "teal" },
  { value: "CLIENTE_AVISADO", label: "Cliente avisado", tone: "amber" },
  { value: "ENTREGUE", label: "Entregue", tone: "green" },
  { value: "CANCELADA", label: "Cancelada", tone: "red" },
]);

export const SO_STATUS = options([
  { value: "ABERTA", label: "Aberta", tone: "blue" },
  { value: "DIAGNOSTICO", label: "Em diagnóstico", tone: "purple" },
  { value: "AGUARDANDO_PECA", label: "Aguardando peça", tone: "amber" },
  { value: "EM_REPARO", label: "Em reparo", tone: "pink" },
  { value: "PRONTA", label: "Pronta", tone: "teal" },
  { value: "ENTREGUE", label: "Entregue", tone: "green" },
  { value: "CANCELADA", label: "Cancelada", tone: "red" },
]);

export const SO_PRIORITY = options([
  { value: "BAIXA", label: "Baixa", tone: "gray" },
  { value: "NORMAL", label: "Normal", tone: "blue" },
  { value: "ALTA", label: "Alta", tone: "amber" },
  { value: "URGENTE", label: "Urgente", tone: "red" },
]);

export const SO_KIND = options([
  { value: "INTERNA", label: "Interna (preparação)", tone: "purple" },
  { value: "CLIENTE", label: "Cliente", tone: "blue" },
]);

export const ENTRY_STATUS = options([
  { value: "ABERTA", label: "Aberta", tone: "blue" },
  { value: "PAGA", label: "Paga", tone: "green" },
  { value: "VENCIDA", label: "Vencida", tone: "red" },
  { value: "CANCELADA", label: "Cancelada", tone: "gray" },
]);

export const ACCOUNT_KIND = options([
  { value: "CAIXA", label: "Caixa físico" },
  { value: "BANCO", label: "Banco" },
  { value: "MAQUININHA", label: "Maquininha" },
]);

export const ORIGIN_TYPE = options([
  { value: "VENDA", label: "Venda" },
  { value: "COMPRA", label: "Compra" },
  { value: "OS", label: "Ordem de serviço" },
  { value: "ENCOMENDA", label: "Encomenda" },
  { value: "MANUAL", label: "Lançamento manual" },
  { value: "ESTORNO", label: "Estorno" },
  { value: "CAIXA", label: "Caixa" },
  { value: "COMISSAO", label: "Comissão" },
]);

export const DOCUMENT_TYPE = options([
  { value: "RECIBO", label: "Recibo de venda" },
  { value: "GARANTIA", label: "Termo de garantia" },
  { value: "TERMO_TROCA", label: "Termo de recebimento de aparelho usado" },
  { value: "ENCOMENDA", label: "Comprovante de encomenda" },
  { value: "OS_ENTRADA", label: "Ordem de serviço — entrada" },
  { value: "OS_ENTREGA", label: "Ordem de serviço — entrega" },
  { value: "ORCAMENTO", label: "Orçamento" },
]);

export const TRADE_IN_CHECKLIST = [
  { key: "tela", label: "Tela (touch, manchas, pixels)" },
  { key: "faceId", label: "Face ID / Touch ID" },
  { key: "cameras", label: "Câmeras traseira e frontal" },
  { key: "altoFalantes", label: "Alto-falantes" },
  { key: "microfone", label: "Microfone" },
  { key: "botoes", label: "Botões" },
  { key: "carregamento", label: "Carregamento" },
  { key: "trueTone", label: "True Tone" },
  { key: "icloud", label: "Conta iCloud desvinculada" },
  { key: "semBloqueio", label: "Sem bloqueio de operadora/IMEI" },
] as const;

export const TONE_CLASSES: Record<Tone, string> = {
  gray: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  purple: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
};
