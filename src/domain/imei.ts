// Validação de IMEI: formato, dígito verificador (Luhn) e TAC (8 primeiros dígitos).

export function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Dígito verificador de Luhn para os 14 primeiros dígitos. */
export function luhnCheckDigit(first14: string): number {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    let d = Number(first14[i]);
    // a partir da direita, dobra-se a cada dois — para 14 dígitos isso são as posições ímpares (índice 1, 3, …)
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidLuhn(imei: string): boolean {
  const d = onlyDigits(imei);
  if (d.length !== 15) return false;
  return luhnCheckDigit(d.slice(0, 14)) === Number(d[14]);
}

export type ImeiValidation = {
  imei: string;
  formatOk: boolean;
  luhnOk: boolean;
  tac: string | null;
  message: string;
};

/** Remove espaços, traços e pontos colados ao IMEI; letras e outros símbolos continuam (e reprovam). */
export function normalizeImei(input: string | null | undefined): string {
  return (input ?? "").replace(/[\s.-]/g, "");
}

export function validateImei(input: string): ImeiValidation {
  const imei = normalizeImei(input);
  if (!/^\d*$/.test(imei)) {
    return { imei, formatOk: false, luhnOk: false, tac: null, message: "Use só números no IMEI." };
  }
  if (imei.length !== 15) {
    return {
      imei,
      formatOk: false,
      luhnOk: false,
      tac: imei.length >= 8 ? imei.slice(0, 8) : null,
      message: `IMEI deve ter 15 dígitos (tem ${imei.length}).`,
    };
  }
  if (/^(\d)\1{14}$/.test(imei)) {
    return { imei, formatOk: false, luhnOk: false, tac: imei.slice(0, 8), message: "IMEI inválido (dígitos repetidos)." };
  }
  const luhnOk = isValidLuhn(imei);
  return {
    imei,
    formatOk: true,
    luhnOk,
    tac: imei.slice(0, 8),
    message: luhnOk ? "IMEI válido (dígito verificador confere)." : "IMEI inválido, confira a digitação",
  };
}

/** Gera um IMEI válido a partir de um TAC (usado no seed/testes). */
export function makeImei(tac: string, serial: number): string {
  const first14 = `${tac.padStart(8, "0").slice(0, 8)}${String(serial).padStart(6, "0").slice(-6)}`;
  return `${first14}${luhnCheckDigit(first14)}`;
}
