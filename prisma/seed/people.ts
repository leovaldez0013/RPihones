import type { PrismaClient } from "@prisma/client";
import { chance, daysAgo, int, pick } from "./util";

const FIRST = ["Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Marcos", "Natália", "Otávio", "Patrícia", "Rafael", "Sabrina", "Thiago", "Vanessa", "Wagner", "Beatriz", "Caio", "Daniela", "Enzo", "Fernanda", "Gustavo", "Helena", "Igor", "Júlia", "Leonardo", "Mariana", "Nicolas", "Paula", "Renato", "Sofia", "Vinícius", "Letícia", "Matheus", "Carolina", "Pedro"];
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Moreira", "Araújo"];
const PLACES = [
  { district: "Bela Vista", cep: "01310100" },
  { district: "Pinheiros", cep: "05422000" },
  { district: "Moema", cep: "04077000" },
  { district: "Tatuapé", cep: "03307000" },
  { district: "Santana", cep: "02012000" },
  { district: "Vila Mariana", cep: "04101000" },
  { district: "Mooca", cep: "03104000" },
  { district: "Lapa", cep: "05074000" },
];

function cpf(): string {
  const n = Array.from({ length: 9 }, () => int(0, 9));
  const d = (len: number) => {
    const s = n.slice(0, len).reduce((acc, v, i) => acc + v * (len + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(d(9));
  n.push(d(10));
  return n.join("");
}

export async function seedCustomers(db: PrismaClient, count = 85) {
  const ids: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const first = pick(FIRST);
    const name = `${first} ${pick(LAST)} ${pick(LAST)}`;
    let doc = cpf();
    while (used.has(doc)) doc = cpf();
    used.add(doc);
    const place = pick(PLACES);
    const birth = new Date(int(1965, 2006), int(0, 11), int(1, 28), 12);
    // alguns aniversariantes hoje/nesta semana para a demonstração
    if (i < 3) birth.setMonth(new Date().getMonth(), new Date().getDate() + i * 2);
    const consent = chance(0.8);
    const created = daysAgo(int(5, 400));
    const c = await db.customer.create({
      data: {
        name,
        cpf: doc,
        phone: `119${int(6000, 9999)}${int(1000, 9999)}`,
        email: chance(0.7) ? `${first.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${int(10, 999)}@email.com` : null,
        birthDate: birth,
        cep: place.cep,
        street: pick(["Rua Augusta", "Avenida Paulista", "Rua Oscar Freire", "Rua Vergueiro", "Avenida Ibirapuera", "Rua Tuiuti", "Rua da Mooca"]),
        number: String(int(10, 2500)),
        district: place.district,
        city: "São Paulo",
        state: "SP",
        marketingConsent: consent,
        consentAt: consent ? created : null,
        createdAt: created,
      },
    });
    ids.push(c.id);
  }
  return ids;
}
