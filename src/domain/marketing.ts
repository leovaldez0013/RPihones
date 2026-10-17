// Marketing pós-venda: modelos de mensagem, aniversários e segmentação de clientes (lógica pura).

export type MessageTemplateDef = { key: string; name: string; content: string; requiresConsent: boolean };

/** Modelos padrão (editáveis em Marketing → Modelos de mensagem). */
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplateDef[] = [
  {
    key: "POS_VENDA",
    name: "Pós-venda (D+7)",
    requiresConsent: false,
    content:
      "Olá, {{cliente.primeiro_nome}}! Aqui é da {{loja.nome}} 😊 Passando para saber como está o seu {{aparelho}}. Qualquer dúvida é só chamar por aqui!{{avaliacao}}",
  },
  {
    key: "ANIVERSARIO",
    name: "Aniversário",
    requiresConsent: true,
    content: "Feliz aniversário, {{cliente.primeiro_nome}}! 🎉 A equipe da {{loja.nome}} deseja um ano incrível. Passe na loja esta semana e ganhe 10% de desconto em acessórios. 🎁",
  },
  {
    key: "GARANTIA",
    name: "Garantia vencendo",
    requiresConsent: false,
    content:
      "Olá, {{cliente.primeiro_nome}}! A garantia do seu {{aparelho}} vence em {{garantia.ate}}. Se notar qualquer problema, traga até essa data para avaliarmos sem custo. — {{loja.nome}}",
  },
  {
    key: "UPGRADE",
    name: "Hora do upgrade",
    requiresConsent: true,
    content:
      "Oi, {{cliente.primeiro_nome}}! Seu {{aparelho}} já tem um tempinho de uso. Que tal um upgrade? Aceitamos ele na troca com avaliação na hora. Quer uma simulação? — {{loja.nome}}",
  },
  {
    key: "REATIVACAO",
    name: "Sentimos sua falta",
    requiresConsent: true,
    content: "Oi, {{cliente.primeiro_nome}}! Faz um tempo que você não aparece na {{loja.nome}}. Chegaram iPhones seminovos revisados com garantia — posso te mandar as opções?",
  },
  {
    key: "ACESSORIO",
    name: "Oferta de acessórios",
    requiresConsent: true,
    content: "Oi, {{cliente.primeiro_nome}}! Proteja seu {{aparelho}}: temos capa, película e carregador originais com preço especial para clientes. Quer ver as opções? — {{loja.nome}}",
  },
  {
    key: "VIP",
    name: "Clientes VIP",
    requiresConsent: true,
    content: "{{cliente.primeiro_nome}}, você é um dos nossos clientes especiais! ⭐ Tem novidade chegando na {{loja.nome}} e queremos te mostrar antes de todo mundo. Posso te chamar?",
  },
];

export function templateDef(key: string) {
  return DEFAULT_MESSAGE_TEMPLATES.find((t) => t.key === key);
}

/** Dias até o próximo aniversário (0 = hoje). Usa mês/dia; 29/02 vira 28/02 em anos não bissextos. */
export function daysUntilBirthday(birth: Date, today: Date): number {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next = (year: number) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const day = birth.getUTCMonth() === 1 && birth.getUTCDate() === 29 && !leap ? 28 : birth.getUTCDate();
    return new Date(year, birth.getUTCMonth(), day);
  };
  let n = next(t.getFullYear());
  if (n < t) n = next(t.getFullYear() + 1);
  return Math.round((n.getTime() - t.getTime()) / 86400000);
}

export function ageOn(birth: Date, date: Date): number {
  let age = date.getFullYear() - birth.getUTCFullYear();
  const before = date.getMonth() < birth.getUTCMonth() || (date.getMonth() === birth.getUTCMonth() && date.getDate() < birth.getUTCDate());
  if (before) age--;
  return age;
}

// ── Segmentação ──

export type CustomerProfile = {
  id: string;
  name: string;
  phone: string | null;
  consent: boolean;
  birthDate: Date | null;
  purchases: number;
  totalSpent: number;
  lastPurchase: Date | null;
  firstPurchase: Date | null;
  /** modelos de iPhone comprados (mais recente primeiro) */
  models: string[];
  lastDevice: string | null;
  lastDeviceDate: Date | null;
  /** maior data de fim de garantia entre os aparelhos comprados */
  warrantyUntil: Date | null;
  boughtAccessory: boolean;
};

export const SEGMENTS = [
  { key: "ANIVERSARIANTES", label: "Aniversariantes", param: { label: "Próximos dias", default: 7 }, template: "ANIVERSARIO" },
  { key: "POS_VENDA", label: "Compraram recentemente", param: { label: "Últimos dias", default: 15 }, template: "POS_VENDA" },
  { key: "GARANTIA", label: "Garantia vencendo", param: { label: "Vence em até (dias)", default: 30 }, template: "GARANTIA" },
  { key: "MODELO", label: "Têm um modelo", param: null, template: "UPGRADE" },
  { key: "UPGRADE", label: "Aparelho com 18+ meses", param: { label: "Meses desde a compra", default: 18 }, template: "UPGRADE" },
  { key: "INATIVOS", label: "Sem comprar há meses", param: { label: "Meses sem comprar", default: 6 }, template: "REATIVACAO" },
  { key: "TICKET_ALTO", label: "Ticket alto (VIP)", param: { label: "Gasto mínimo (R$)", default: 10000 }, template: "VIP" },
  { key: "SEM_ACESSORIO", label: "Nunca compraram acessório", param: null, template: "ACESSORIO" },
  { key: "TODOS", label: "Todos os clientes", param: null, template: "VIP" },
] as const;
export type SegmentKey = (typeof SEGMENTS)[number]["key"];

const DAY = 86400000;
const monthsAgo = (today: Date, m: number) => {
  const d = new Date(today);
  d.setMonth(d.getMonth() - m);
  return d;
};

/** Filtra perfis pelo segmento. `param` numérico conforme SEGMENTS; `model` para o segmento MODELO. */
export function applySegment(profiles: CustomerProfile[], key: SegmentKey, opts: { param?: number; model?: string | null; today: Date }): CustomerProfile[] {
  const { today } = opts;
  const p = opts.param ?? SEGMENTS.find((s) => s.key === key)?.param?.default ?? 0;
  switch (key) {
    case "ANIVERSARIANTES":
      return profiles
        .filter((c) => c.birthDate && daysUntilBirthday(c.birthDate, today) <= p)
        .sort((a, b) => daysUntilBirthday(a.birthDate!, today) - daysUntilBirthday(b.birthDate!, today));
    case "POS_VENDA":
      return profiles.filter((c) => c.lastPurchase && today.getTime() - c.lastPurchase.getTime() <= p * DAY).sort((a, b) => b.lastPurchase!.getTime() - a.lastPurchase!.getTime());
    case "GARANTIA":
      return profiles
        .filter((c) => c.warrantyUntil && c.warrantyUntil >= today && c.warrantyUntil.getTime() - today.getTime() <= p * DAY)
        .sort((a, b) => a.warrantyUntil!.getTime() - b.warrantyUntil!.getTime());
    case "MODELO":
      return opts.model ? profiles.filter((c) => c.models.includes(opts.model!)) : [];
    case "UPGRADE":
      return profiles.filter((c) => c.lastDeviceDate && c.lastDeviceDate <= monthsAgo(today, p)).sort((a, b) => a.lastDeviceDate!.getTime() - b.lastDeviceDate!.getTime());
    case "INATIVOS":
      return profiles.filter((c) => c.lastPurchase && c.lastPurchase <= monthsAgo(today, p)).sort((a, b) => a.lastPurchase!.getTime() - b.lastPurchase!.getTime());
    case "TICKET_ALTO":
      return profiles.filter((c) => c.totalSpent >= p * 100).sort((a, b) => b.totalSpent - a.totalSpent);
    case "SEM_ACESSORIO":
      return profiles.filter((c) => c.models.length > 0 && !c.boughtAccessory);
    case "TODOS":
      return [...profiles].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }
}

/** Contexto das variáveis de uma mensagem para o cliente. */
export function messageContext(c: Pick<CustomerProfile, "name" | "lastDevice" | "warrantyUntil">, store: { name: string; reviewUrl?: string | null }, formatDate: (d: Date) => string) {
  return {
    cliente: { nome: c.name, primeiro_nome: c.name.split(" ")[0] },
    loja: { nome: store.name },
    aparelho: c.lastDevice ?? "iPhone",
    garantia: { ate: c.warrantyUntil ? formatDate(c.warrantyUntil) : "" },
    avaliacao: store.reviewUrl ? `\n\nSe puder, deixe sua avaliação: ${store.reviewUrl}` : "",
  };
}
