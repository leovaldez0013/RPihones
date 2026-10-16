import { describe, expect, it } from "vitest";
import { formatBRL, parseBRL, pct, splitCents } from "@/domain/money";
import { isValidCNPJ, isValidCPF } from "@/lib/validators";
import { can } from "@/lib/permissions";

describe("dinheiro em centavos", () => {
  it("formata em R$", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
  it("interpreta formatos brasileiros", () => {
    expect(parseBRL("1.234,56")).toBe(123456);
    expect(parseBRL("R$ 10")).toBe(1000);
    expect(parseBRL("0,1")).toBe(10);
  });
  it("calcula percentual sem erro de ponto flutuante", () => {
    expect(pct(10000, 3.49)).toBe(349);
    expect(pct(333, 10)).toBe(33);
  });
  it("divide valores sem perder centavos", () => {
    const parts = splitCents(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("documentos", () => {
  it("valida CPF", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("529.982.247-24")).toBe(false);
  });
  it("valida CNPJ", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-80")).toBe(false);
  });
});

describe("permissões", () => {
  it("vendedor não vê custo nem configura usuários", () => {
    expect(can("VENDEDOR", "devices.viewCost")).toBe(false);
    expect(can("VENDEDOR", "settings.users")).toBe(false);
    expect(can("VENDEDOR", "sales.create")).toBe(true);
  });
  it("gerente não gerencia usuários nem dados da empresa", () => {
    expect(can("GERENTE", "settings.users")).toBe(false);
    expect(can("GERENTE", "settings.store")).toBe(false);
    expect(can("GERENTE", "finance.view")).toBe(true);
  });
  it("técnico só OS e consulta", () => {
    expect(can("TECNICO", "serviceOrders.edit")).toBe(true);
    expect(can("TECNICO", "sales.create")).toBe(false);
  });
});
