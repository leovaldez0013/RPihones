// Valor por extenso em reais (pt-BR), para recibos.

const UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(CEN[c]);
  if (r) {
    if (r < 20) parts.push(UNI[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      parts.push(u ? `${DEZ[d]} e ${UNI[u]}` : DEZ[d]);
    }
  }
  return parts.join(" e ");
}

function inteiro(n: number): string {
  if (n === 0) return "zero";
  const groups: { value: number; sing: string; plur: string }[] = [
    { value: Math.floor(n / 1_000_000_000) % 1000, sing: "bilhão", plur: "bilhões" },
    { value: Math.floor(n / 1_000_000) % 1000, sing: "milhão", plur: "milhões" },
    { value: Math.floor(n / 1000) % 1000, sing: "mil", plur: "mil" },
    { value: n % 1000, sing: "", plur: "" },
  ];
  const parts: string[] = [];
  groups.forEach((g, i) => {
    if (!g.value) return;
    let txt = g.sing === "mil" && g.value === 1 ? "mil" : ate999(g.value);
    if (g.sing && !(g.sing === "mil" && g.value === 1)) txt += ` ${g.value === 1 ? g.sing : g.plur}`;
    parts.push(txt);
    void i;
  });
  // "e" antes do último grupo quando ele é < 100 ou centena redonda
  if (parts.length > 1) {
    const last = n % 1000;
    if (last && (last < 100 || last % 100 === 0)) {
      const tail = parts.pop()!;
      return `${parts.join(", ")} e ${tail}`;
    }
  }
  return parts.join(", ");
}

/** 123456 (centavos) → "mil, duzentos e trinta e quatro reais e cinquenta e seis centavos" */
export function reaisPorExtenso(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100);
  const cent = abs % 100;
  const parts: string[] = [];
  if (reais) {
    const milhoesRedondos = reais >= 1_000_000 && reais % 1_000_000 === 0;
    parts.push(`${inteiro(reais)}${milhoesRedondos ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (cent) parts.push(`${inteiro(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  if (!parts.length) return "zero real";
  return parts.join(" e ");
}
