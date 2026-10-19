// Monta o contexto de variáveis de cada tipo de documento.
import type { Tx } from "@/lib/db";
import { parseJson } from "@/lib/db";
import { formatBRL } from "@/domain/money";
import { reaisPorExtenso } from "@/domain/extenso";
import { mdList, mdTable } from "@/domain/template";
import { simulateInstallments } from "@/domain/installments";
import { warrantyUntil } from "@/domain/sale";
import { DEVICE_CONDITION, ORDER_STATUS, PAYMENT_METHOD, SO_PRIORITY, TRADE_IN_CHECKLIST } from "@/domain/constants";
import { formatCEP, formatCPF, formatDate, formatDocument, formatLongDate, formatPhone, imeiText } from "@/lib/format";
import { getCardRules, getWarrantyDays } from "@/features/sales/config";

export type DocCtx = Record<string, unknown>;

type CustomerLike = {
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
} | null;

export async function storeContext(tx: Tx): Promise<DocCtx> {
  const s = await tx.storeSettings.findUnique({ where: { id: "default" } });
  const endereco = s
    ? [s.street && `${s.street}, ${s.number ?? "s/n"}`, s.complement, s.district, s.city && `${s.city}/${s.state ?? ""}`, s.cep && `CEP ${formatCEP(s.cep)}`].filter(Boolean).join(" · ")
    : "";
  return {
    loja: {
      nome: s?.name ?? "",
      razao_social: s?.legalName || s?.name || "",
      cnpj: formatDocument(s?.cnpj),
      endereco,
      cidade: s?.city ?? "",
      telefone: formatPhone(s?.phone),
      whatsapp: formatPhone(s?.whatsapp),
      instagram: s?.instagram ?? "",
      email: s?.email ?? "",
      site: s?.website ?? "",
      logo: s?.logoUrl ?? "",
    },
    data_hoje: formatDate(new Date()),
    data_hoje_extenso: formatLongDate(new Date()),
  };
}

export function customerContext(c: CustomerLike): DocCtx {
  return {
    cliente: {
      nome: c?.name ?? "Consumidor",
      cpf: c?.cpf ? formatCPF(c.cpf) : "não informado",
      telefone: formatPhone(c?.phone) || "",
      email: c?.email ?? "",
      endereco: c ? [c.street && `${c.street}, ${c.number ?? "s/n"}`, c.complement, c.district, c.city && `${c.city}/${c.state ?? ""}`, c.cep && `CEP ${formatCEP(c.cep)}`].filter(Boolean).join(" · ") || "não informado" : "não informado",
    },
  };
}

function checklistText(raw: string) {
  const ck = parseJson<Record<string, boolean>>(raw, {});
  return mdList(TRADE_IN_CHECKLIST.map((c) => `${c.label}: ${ck[c.key] === false ? "**com problema**" : "OK"}`));
}

export async function saleContext(tx: Tx, saleId: string): Promise<{ ctx: DocCtx; customerId: string | null; number: number }> {
  const s = await tx.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      customer: true,
      seller: true,
      items: { include: { device: { include: { model: true } } } },
      payments: true,
      tradeIns: true,
    },
  });
  const warranty = await getWarrantyDays(tx);
  const date = s.completedAt ?? s.createdAt;
  const items = s.items.filter((i) => i.active || s.status !== "CONCLUIDA");
  const itensTable = mdTable(
    ["Qtd", "Descrição", "Valor"],
    items.map((i) => [i.quantity, i.device ? `${i.device.model.name} ${i.device.capacity} ${i.device.color} — ${imeiText(i.device.imei)}` : i.description, formatBRL(i.unitPrice * i.quantity - i.discount)]),
  );
  const pagamentos = mdList(
    s.payments.map((p) => {
      const parc = p.installments > 1 ? ` em ${p.installments}x de ${formatBRL(Math.ceil((p.amount + p.interest) / p.installments))}` : "";
      const juros = p.interest ? ` (com juros: ${formatBRL(p.amount + p.interest)})` : "";
      return `${PAYMENT_METHOD.label(p.method)}: ${formatBRL(p.amount)}${parc}${juros}`;
    }),
  );
  const garantiaItens = mdTable(
    ["Produto", "IMEI / código", "Condição", "Garantia", "Válida até"],
    items.map((i) => [
      i.device ? `${i.device.model.name} ${i.device.capacity} ${i.device.color}` : i.description,
      i.device?.imei ?? "—",
      i.device ? DEVICE_CONDITION.label(i.device.condition) : "Acessório",
      `${i.warrantyDays} dias`,
      formatDate(warrantyUntil(date, i.warrantyDays)),
    ]),
  );
  const firstDevice = items.find((i) => i.device)?.device;
  const clauses =
    (firstDevice ? warranty[firstDevice.condition]?.clauses : warranty.ACESSORIO?.clauses) ?? "Garantia contra defeitos de funcionamento. Não cobre quedas, líquidos ou mau uso.";
  const maxDays = Math.max(0, ...items.map((i) => i.warrantyDays));

  let parcelamento = "";
  if (s.status === "ORCAMENTO") {
    const tradeTotal = s.tradeIns.reduce((a, t) => a + t.finalValue, 0);
    const base = Math.max(0, s.total - tradeTotal);
    const sim = simulateInstallments(base, await getCardRules(tx));
    parcelamento = mdList([
      `À vista no PIX ou dinheiro: **${formatBRL(base)}**`,
      ...sim.filter((x) => [1, 3, 6, 10, 12].includes(x.installments)).map((x) => `${x.installments}x de ${formatBRL(x.installmentValues.at(-1)!)}${x.withInterest ? ` (total ${formatBRL(x.customerTotal)})` : " sem juros"}`),
    ]);
  }

  return {
    customerId: s.customerId,
    number: s.number,
    ctx: {
      ...customerContext(s.customer),
      venda: {
        numero: s.number,
        data: formatDate(date),
        subtotal: formatBRL(s.subtotal),
        desconto: formatBRL(s.itemDiscount + s.discount),
        total: formatBRL(s.total),
        total_extenso: reaisPorExtenso(s.total),
        juros: formatBRL(s.interest),
        itens: itensTable,
        formas_pagamento: pagamentos || "—",
        vendedor: s.seller.name,
        validade: formatDate(s.validUntil),
        parcelamento,
        troca: s.tradeIns.length ? `**Aparelho na troca:** ${s.tradeIns.map((t) => `IMEI ${t.imei} — ${formatBRL(t.finalValue)}`).join(", ")}` : "",
      },
      aparelho: firstDevice
        ? {
            modelo: firstDevice.model.name,
            capacidade: firstDevice.capacity,
            cor: firstDevice.color,
            imei: firstDevice.imei,
            serial: firstDevice.serial ?? "",
            condicao: DEVICE_CONDITION.label(firstDevice.condition),
            bateria: firstDevice.batteryHealth != null ? `${firstDevice.batteryHealth}%` : "",
          }
        : {},
      garantia: { itens: garantiaItens, clausulas: clauses, dias: maxDays, ate: formatDate(warrantyUntil(date, maxDays)) },
    },
  };
}

export async function tradeInContext(tx: Tx, tradeInId: string): Promise<{ ctx: DocCtx; customerId: string | null }> {
  const t = await tx.tradeIn.findUniqueOrThrow({ where: { id: tradeInId }, include: { customer: true, sale: true } });
  const model = await tx.deviceModel.findUnique({ where: { id: t.modelId } });
  return {
    customerId: t.customerId,
    ctx: {
      ...customerContext(t.customer),
      troca: {
        finalidade: `como parte do pagamento (troca/upgrade) da venda nº ${t.sale?.number ?? ""}`,
        valor: formatBRL(t.finalValue),
        valor_extenso: reaisPorExtenso(t.finalValue),
        aparelho: mdTable(["Modelo", "Capacidade", "Cor", "IMEI", "Nº de série"], [[model?.name ?? "", t.capacity, t.color, t.imei, t.serial ?? "—"]]),
        bateria: t.batteryHealth != null ? `${t.batteryHealth}%` : "não informada",
        grade: t.grade ?? "—",
        checklist: checklistText(t.checklist),
        referencia: t.sale ? `Referência: venda nº ${t.sale.number}.` : "",
      },
    },
  };
}

export async function usedPurchaseContext(tx: Tx, id: string): Promise<{ ctx: DocCtx; customerId: string }> {
  const p = await tx.usedDevicePurchase.findUniqueOrThrow({ where: { id }, include: { customer: true, device: { include: { model: true } } } });
  const d = p.device;
  return {
    customerId: p.customerId,
    ctx: {
      ...customerContext(p.customer),
      troca: {
        finalidade: `em **venda** (compra pela loja nº ${p.number}), recebendo o pagamento via ${p.paymentMethod === "DINHEIRO" ? "dinheiro" : p.paymentMethod === "PIX" ? "PIX" : "transferência"}`,
        valor: formatBRL(p.value),
        valor_extenso: reaisPorExtenso(p.value),
        aparelho: mdTable(["Modelo", "Capacidade", "Cor", "IMEI", "Nº de série"], [[d.model.name, d.capacity, d.color, d.imei ?? "—", d.serial ?? "—"]]),
        bateria: d.batteryHealth != null ? `${d.batteryHealth}%` : "não informada",
        grade: d.grade ?? "—",
        checklist: checklistText(p.checklist),
        referencia: `Compra de aparelho usado nº ${p.number}.`,
      },
    },
  };
}

export async function orderContext(tx: Tx, orderId: string): Promise<{ ctx: DocCtx; customerId: string }> {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true } });
  const faixa = o.minPrice || o.maxPrice ? `${o.minPrice ? formatBRL(o.minPrice) : "—"} a ${o.maxPrice ? formatBRL(o.maxPrice) : "—"}` : "a combinar";
  return {
    customerId: o.customerId,
    ctx: {
      ...customerContext(o.customer),
      encomenda: {
        numero: o.number,
        data: formatDate(o.createdAt),
        modelo: o.modelName,
        capacidade: o.capacity ?? "qualquer",
        cor: o.color ?? "qualquer",
        condicao: o.condition ? DEVICE_CONDITION.label(o.condition) : "qualquer",
        faixa_preco: faixa,
        sinal: formatBRL(o.deposit),
        forma_sinal: o.depositMethod ? PAYMENT_METHOD.label(o.depositMethod) : "—",
        previsao: o.dueDate ? formatDate(o.dueDate) : "a combinar",
        status: ORDER_STATUS.label(o.status),
        observacoes: o.notes ?? "",
      },
    },
  };
}

export async function serviceOrderContext(tx: Tx, soId: string): Promise<{ ctx: DocCtx; customerId: string | null }> {
  const o = await tx.serviceOrder.findUniqueOrThrow({
    where: { id: soId },
    include: { customer: true, device: { include: { model: true } }, parts: { include: { accessory: true } } },
  });
  const warranty = await getWarrantyDays(tx);
  const aparelho = o.device ? `${o.device.model.name} ${o.device.capacity} ${o.device.color} — ${imeiText(o.device.imei)}` : `${o.deviceDescription ?? ""}${o.imei ? ` — IMEI ${o.imei}` : ""}`;
  const delivered = o.deliveredAt ?? new Date();
  const days = warranty.SERVICO?.days ?? 90;
  return {
    customerId: o.customerId,
    ctx: {
      ...customerContext(o.customer),
      os: {
        numero: o.number,
        data: formatDate(o.createdAt),
        prazo: o.dueDate ? formatDate(o.dueDate) : "a combinar",
        entrega: formatDate(o.deliveredAt),
        prioridade: SO_PRIORITY.label(o.priority),
        aparelho,
        defeito: o.problem,
        servicos: o.services ?? "",
        diagnostico: o.diagnosis ?? "",
        valor: formatBRL(o.price),
        checklist: checklistText(o.checklist),
        pecas: o.parts.length ? mdTable(["Peça", "Qtd"], o.parts.map((p) => [p.accessory.name, p.quantity])) : "",
      },
      garantia: { dias: days, ate: formatDate(warrantyUntil(delivered, days)), clausulas: warranty.SERVICO?.clauses ?? "" },
    },
  };
}

/** Contexto de exemplo para a pré-visualização no editor de modelos. */
export function sampleContext(): DocCtx {
  return {
    loja: { nome: "RP iPhones", razao_social: "RP Comércio de Eletrônicos LTDA", cnpj: "11.222.333/0001-81", endereco: "Av. Paulista, 1000 · São Paulo/SP", cidade: "São Paulo", telefone: "(11) 98765-4321", whatsapp: "(11) 98765-4321", instagram: "@rpiphones", email: "contato@rpiphones.com.br", site: "", logo: "" },
    data_hoje: formatDate(new Date()),
    data_hoje_extenso: formatLongDate(new Date()),
    documento: { numero: 123, titulo: "Exemplo" },
    cliente: { nome: "Maria da Silva", cpf: "529.982.247-25", telefone: "(11) 91234-5678", email: "maria@email.com", endereco: "Rua Augusta, 500 · São Paulo/SP" },
    venda: {
      numero: 456,
      data: formatDate(new Date()),
      subtotal: "R$ 7.040,00",
      desconto: "R$ 100,00",
      total: "R$ 6.940,00",
      total_extenso: reaisPorExtenso(694000),
      juros: "R$ 0,00",
      itens: mdTable(["Qtd", "Descrição", "Valor"], [[1, "iPhone 15 Pro 256GB Titânio natural — IMEI 353305959999992", "R$ 6.890,00"], [1, "Película 3D", "R$ 49,90"]]),
      formas_pagamento: mdList(["Aparelho na troca: R$ 2.500,00", "Crédito parcelado: R$ 4.440,00 em 10x de R$ 497,72"]),
      vendedor: "Lucas Vendedor",
      validade: formatDate(new Date(Date.now() + 7 * 86400000)),
      parcelamento: mdList(["À vista: R$ 6.940,00", "10x de R$ 777,82 (total R$ 7.778,20)"]),
      troca: "**Aparelho na troca:** IMEI 353154927770014 — R$ 2.500,00",
    },
    aparelho: { modelo: "iPhone 15 Pro", capacidade: "256GB", cor: "Titânio natural", imei: "353305959999992", serial: "F2LXK9", condicao: "Seminovo", bateria: "91%" },
    garantia: { itens: mdTable(["Produto", "IMEI", "Condição", "Garantia", "Válida até"], [["iPhone 15 Pro 256GB", "353305959999992", "Seminovo", "90 dias", formatDate(new Date(Date.now() + 90 * 86400000))]]), clausulas: "A garantia não cobre quedas, líquidos ou mau uso.", dias: 90, ate: formatDate(new Date(Date.now() + 90 * 86400000)) },
    troca: { finalidade: "como parte do pagamento (troca/upgrade) da venda nº 456", valor: "R$ 2.500,00", valor_extenso: reaisPorExtenso(250000), aparelho: mdTable(["Modelo", "Capacidade", "Cor", "IMEI", "Nº de série"], [["iPhone 13", "128GB", "Meia-noite", "353154927770014", "—"]]), bateria: "86%", grade: "A", checklist: mdList(["Tela: OK", "Face ID / Touch ID: OK"]), referencia: "Referência: venda nº 456." },
    encomenda: { numero: 12, data: formatDate(new Date()), modelo: "iPhone 16 Pro Max", capacidade: "256GB", cor: "Titânio-deserto", condicao: "Seminovo", faixa_preco: "R$ 7.000,00 a R$ 8.000,00", sinal: "R$ 500,00", forma_sinal: "PIX", previsao: formatDate(new Date(Date.now() + 10 * 86400000)), status: "Aberta", observacoes: "" },
    os: { numero: 78, data: formatDate(new Date()), prazo: formatDate(new Date(Date.now() + 3 * 86400000)), entrega: formatDate(new Date()), prioridade: "Normal", aparelho: "iPhone 12 128GB Azul — IMEI 353154927770014", defeito: "Bateria descarregando rápido", servicos: "Troca de bateria", diagnostico: "Bateria com 72% de saúde substituída", valor: "R$ 349,00", checklist: mdList(["Tela: OK", "Câmeras: OK"]), pecas: mdTable(["Peça", "Qtd"], [["Bateria iPhone 12", 1]]) },
  };
}
