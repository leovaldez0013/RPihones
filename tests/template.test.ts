import { describe, expect, it } from "vitest";
import { listVariables, mdTable, parseMarkdown, renderTemplate } from "@/domain/template";

describe("modelos de documento", () => {
  const ctx = { cliente: { nome: "Ana", cpf: "123.456.789-09" }, venda: { total: "R$ 1.000,00" }, vazio: "" };

  it("substitui variáveis aninhadas e lista as ausentes", () => {
    const r = renderTemplate("Olá {{cliente.nome}}, total {{ venda.total }}. {{nao.existe}}{{vazio}}", ctx);
    expect(r.text).toBe("Olá Ana, total R$ 1.000,00. ");
    expect(r.missing).toEqual(["nao.existe"]);
  });

  it("mantém marcadores de assinatura como blocos", () => {
    const r = renderTemplate("texto\n\n{{assinatura_cliente}}", ctx);
    const blocks = parseMarkdown(r.text);
    expect(blocks.at(-1)).toEqual({ type: "signature", who: "cliente" });
  });

  it("interpreta títulos, negrito, listas, tabelas e linhas", () => {
    const md = ["# Recibo", "", "Recebemos de **Ana** a quantia.", "", "- item 1", "- item 2", "", mdTable(["Item", "Valor"], [["iPhone", "R$ 10"]]), "", "---", "->Centralizado<-"].join("\n");
    const b = parseMarkdown(md);
    expect(b.map((x) => x.type)).toEqual(["h1", "p", "ul", "table", "hr", "p"]);
    const p = b[1] as { inline: { text: string; bold?: boolean }[] };
    expect(p.inline.find((i) => i.bold)?.text).toBe("Ana");
    const t = b[3] as { rows: { text: string }[][][] };
    expect(t.rows[0][0][0].text).toBe("iPhone");
    expect((b[5] as { align?: string }).align).toBe("center");
  });

  it("lista variáveis do contexto", () => {
    expect(listVariables(ctx)).toEqual(["cliente.nome", "cliente.cpf", "venda.total", "vazio"]);
  });
});

import { reaisPorExtenso } from "@/domain/extenso";
describe("valor por extenso", () => {
  it("escreve valores em reais", () => {
    expect(reaisPorExtenso(100)).toBe("um real");
    expect(reaisPorExtenso(150)).toBe("um real e cinquenta centavos");
    expect(reaisPorExtenso(10000)).toBe("cem reais");
    expect(reaisPorExtenso(459000)).toBe("quatro mil, quinhentos e noventa reais");
    expect(reaisPorExtenso(100100)).toBe("mil e um reais");
    expect(reaisPorExtenso(123456)).toBe("mil, duzentos e trinta e quatro reais e cinquenta e seis centavos");
    expect(reaisPorExtenso(200000000)).toBe("dois milhões de reais");
  });
});
