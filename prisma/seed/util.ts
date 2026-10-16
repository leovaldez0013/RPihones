// Gerador pseudoaleatório determinístico: o seed gera sempre os mesmos dados.
let state = 20261016;

export function rand(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}

export function int(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function chance(p: number): boolean {
  return rand() < p;
}

/** Arredonda para preço "comercial" (ex.: 3.490,00). */
export function commercial(cents: number): number {
  const reais = Math.round(cents / 100);
  return (Math.round(reais / 50) * 50 - 10) * 100;
}

export function daysAgo(days: number, hour = 12): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, int(0, 59), 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
