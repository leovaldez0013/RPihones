import { describe, expect, it } from "vitest";
import { isValidLuhn, luhnCheckDigit, makeImei, validateImei } from "@/domain/imei";

describe("IMEI", () => {
  it("valida IMEIs conhecidos pelo algoritmo de Luhn", () => {
    // exemplo clássico da documentação do GSMA/Wikipedia
    expect(isValidLuhn("490154203237518")).toBe(true);
    expect(isValidLuhn("490154203237517")).toBe(false);
    expect(luhnCheckDigit("49015420323751")).toBe(8);
  });

  it("aceita máscara/espaços e extrai o TAC", () => {
    const r = validateImei("49-015420-323751-8");
    expect(r.formatOk).toBe(true);
    expect(r.luhnOk).toBe(true);
    expect(r.tac).toBe("49015420");
  });

  it("rejeita tamanho errado e dígitos repetidos", () => {
    expect(validateImei("12345").formatOk).toBe(false);
    expect(validateImei("000000000000000").formatOk).toBe(false);
  });

  it("gera IMEIs válidos a partir do TAC", () => {
    for (let i = 0; i < 50; i++) {
      const imei = makeImei("35123456", i * 7919);
      expect(imei).toHaveLength(15);
      expect(isValidLuhn(imei)).toBe(true);
    }
  });
});
