import type { PrismaClient } from "@prisma/client";
import { CATALOG } from "../data/catalog";
import { makeImei } from "../../src/domain/imei";
import { chance, commercial, daysAgo, int, pick } from "./util";

export const DEMO_TAC_NOTE = "TAC fictício (demonstração)";

/** Preço base (seminovo, menor capacidade) em reais. */
export const BASE_PRICE: Record<string, number> = {
  "iPhone 11": 1690, "iPhone 11 Pro": 2090, "iPhone 11 Pro Max": 2390,
  "iPhone 12 mini": 1890, "iPhone 12": 2290, "iPhone 12 Pro": 2890, "iPhone 12 Pro Max": 3290,
  "iPhone 13 mini": 2590, "iPhone 13": 2990, "iPhone 13 Pro": 3790, "iPhone 13 Pro Max": 4290,
  "iPhone 14": 3490, "iPhone 14 Plus": 3790, "iPhone 14 Pro": 4690, "iPhone 14 Pro Max": 5290,
  "iPhone 15": 4290, "iPhone 15 Plus": 4690, "iPhone 15 Pro": 5690, "iPhone 15 Pro Max": 6490,
  "iPhone 16": 5290, "iPhone 16 Plus": 5790, "iPhone 16 Pro": 6990, "iPhone 16 Pro Max": 7990, "iPhone 16e": 3990,
  "iPhone 17": 6490, "iPhone Air": 7990, "iPhone 17 Pro": 9490, "iPhone 17 Pro Max": 10690,
  // estimativa (lançamento set/2026): ajuste a tabela de avaliação em Configurações
  "iPhone 18 Pro": 10490, "iPhone 18 Pro Max": 11690, "iPhone Duo": 13990,
};

export function priceFor(model: string, capacities: string[], capacity: string, condition: string): number {
  const step = Math.max(capacities.indexOf(capacity), 0);
  let reais = (BASE_PRICE[model] ?? 3000) * (1 + step * 0.12);
  if (condition === "NOVO") reais *= 1.22;
  if (condition === "VITRINE") reais *= 1.1;
  if (condition === "RECONDICIONADO") reais *= 0.92;
  return commercial(reais * 100);
}

export async function seedCatalog(db: PrismaClient, opts: { demo: boolean }) {
  const models: Record<string, { id: string; tac: string; colors: string[]; capacities: string[]; year: number }> = {};
  let i = 0;
  for (const m of CATALOG) {
    const saved = await db.deviceModel.upsert({
      where: { name: m.name },
      update: {},
      create: { ...m, colors: JSON.stringify(m.colors), capacities: JSON.stringify(m.capacities), sortOrder: i },
    });
    // TAC fictício só na demonstração: no uso real o sistema aprende os TACs verdadeiros a cada cadastro
    const tac = `35${String(310000 + i * 1373).padStart(6, "0")}`;
    if (opts.demo) await db.tacEntry.upsert({ where: { tac }, update: {}, create: { tac, modelId: saved.id, note: DEMO_TAC_NOTE } });
    models[m.name] = { id: saved.id, tac, colors: m.colors, capacities: m.capacities, year: m.year };
    i++;
  }
  return models;
}

export async function seedSuppliers(db: PrismaClient) {
  const list = [
    { kind: "PJ", name: "Distribuidora TechImport LTDA", document: "11444777000161", phone: "11933334444", email: "vendas@techimport.com.br", contact: "Ricardo" },
    { kind: "PJ", name: "Mega Cell Atacado", document: "45997418000153", phone: "11944445555", email: "comercial@megacell.com.br", contact: "Patrícia" },
    { kind: "PJ", name: "AcessoPlus Acessórios", document: "18236120000158", phone: "11955556666", email: "pedidos@acessoplus.com.br", contact: "Júlio" },
    { kind: "PF", name: "Carlos Revendedor", document: "52998224725", phone: "11966667777", email: null, contact: null },
  ];
  const ids: string[] = [];
  for (const s of list) {
    const saved = await db.supplier.upsert({ where: { document: s.document }, update: {}, create: s });
    ids.push(saved.id);
  }
  return ids;
}

/** Aparelhos em estoque (entradas avulsas/compras dos últimos ~7 meses). */
export async function seedDevices(
  db: PrismaClient,
  models: Awaited<ReturnType<typeof seedCatalog>>,
  supplierIds: string[],
  userId: string,
  count = 170,
) {
  const names = Object.keys(models);
  // modelos mais recentes aparecem com mais frequência
  const weighted = names.flatMap((n) => Array(Math.max(1, models[n].year - 2018)).fill(n) as string[]);
  const devices: { id: string; model: string; modelId: string; supplierId: string; capacity: string; color: string; condition: string; salePrice: number; cost: number; entryDate: Date }[] = [];

  for (let n = 0; n < count; n++) {
    const name = pick(weighted);
    const m = models[name];
    const capacity = pick(m.capacities.slice(0, 3));
    const color = pick(m.colors);
    const condition = m.year >= 2025 ? (chance(0.6) ? "NOVO" : "SEMINOVO") : chance(0.08) ? "VITRINE" : chance(0.05) ? "RECONDICIONADO" : "SEMINOVO";
    const salePrice = priceFor(name, m.capacities, capacity, condition);
    const cost = Math.round((salePrice * (0.76 + int(0, 8) / 100)) / 1000) * 1000;
    const entryDate = daysAgo(int(1, 210), int(9, 18));
    const supplierId = pick(supplierIds.slice(0, 2));
    const imei = makeImei(m.tac, 100000 + n * 37 + int(0, 30));
    const battery = condition === "NOVO" ? 100 : Math.max(76, 100 - int(0, 22) - (2025 - m.year) * 2);
    const d = await db.device.create({
      data: {
        imei,
        serial: `F${int(10, 99)}${String.fromCharCode(65 + int(0, 25))}${int(1000, 9999)}${String.fromCharCode(65 + int(0, 25))}${int(10, 99)}`,
        modelId: m.id,
        capacity,
        color,
        condition,
        batteryHealth: battery,
        grade: condition === "NOVO" ? "A+" : pick(["A+", "A", "A", "A", "B", "B", "C"]),
        origin: "COMPRA",
        supplierId,
        acquisitionCost: cost,
        salePrice,
        entryDate,
        appleWarrantyUntil: condition === "NOVO" ? new Date(entryDate.getTime() + 365 * 86400000) : null,
        status: "DISPONIVEL",
        events: { create: { type: "ENTRADA", description: "Entrada no estoque (dados de demonstração)", userId, createdAt: entryDate } },
      },
    });
    devices.push({ id: d.id, model: name, modelId: m.id, supplierId, capacity, color, condition, salePrice, cost, entryDate });
  }
  return devices;
}

export async function seedAccessories(db: PrismaClient, userId: string) {
  const items: { sku: string; barcode?: string; name: string; category: string; cost: number; price: number; qty: number; min: number; compat?: string[]; isPart?: boolean; brand?: string }[] = [
    { sku: "CAP-MS-15", barcode: "7891000100015", name: "Capa silicone MagSafe iPhone 15", category: "CAPA", cost: 3500, price: 12900, qty: 14, min: 4, compat: ["iPhone 15"] },
    { sku: "CAP-MS-15PM", barcode: "7891000100022", name: "Capa silicone MagSafe iPhone 15 Pro Max", category: "CAPA", cost: 3500, price: 12900, qty: 9, min: 4, compat: ["iPhone 15 Pro Max"] },
    { sku: "CAP-MS-16", barcode: "7891000100039", name: "Capa silicone MagSafe iPhone 16", category: "CAPA", cost: 3800, price: 13900, qty: 12, min: 4, compat: ["iPhone 16"] },
    { sku: "CAP-MS-16PM", barcode: "7891000100046", name: "Capa silicone MagSafe iPhone 16 Pro Max", category: "CAPA", cost: 3800, price: 13900, qty: 3, min: 4, compat: ["iPhone 16 Pro Max"] },
    { sku: "CAP-TR-17P", barcode: "7891000100053", name: "Capa transparente MagSafe iPhone 17 Pro", category: "CAPA", cost: 4200, price: 14900, qty: 10, min: 4, compat: ["iPhone 17 Pro"] },
    { sku: "CAP-TR-17PM", barcode: "7891000100060", name: "Capa transparente MagSafe iPhone 17 Pro Max", category: "CAPA", cost: 4200, price: 14900, qty: 8, min: 4, compat: ["iPhone 17 Pro Max"] },
    { sku: "CAP-AB-13", barcode: "7891000100077", name: "Capa anti-impacto iPhone 13/14", category: "CAPA", cost: 1200, price: 5990, qty: 22, min: 6, compat: ["iPhone 13", "iPhone 14"] },
    { sku: "CAP-AB-12", barcode: "7891000100084", name: "Capa anti-impacto iPhone 12/12 Pro", category: "CAPA", cost: 1200, price: 5990, qty: 2, min: 5, compat: ["iPhone 12", "iPhone 12 Pro"] },
    { sku: "PEL-3D-15", barcode: "7891000200014", name: "Película 3D vidro iPhone 15/16", category: "PELICULA", cost: 600, price: 4990, qty: 40, min: 10, compat: ["iPhone 15", "iPhone 16"] },
    { sku: "PEL-3D-15PM", barcode: "7891000200021", name: "Película 3D vidro iPhone 15/16 Pro Max", category: "PELICULA", cost: 600, price: 4990, qty: 35, min: 10, compat: ["iPhone 15 Pro Max", "iPhone 16 Pro Max"] },
    { sku: "PEL-3D-17", barcode: "7891000200038", name: "Película 3D vidro iPhone 17 / 17 Pro", category: "PELICULA", cost: 700, price: 5990, qty: 30, min: 10, compat: ["iPhone 17", "iPhone 17 Pro"] },
    { sku: "PEL-PRIV-14", barcode: "7891000200045", name: "Película privacidade iPhone 13/14", category: "PELICULA", cost: 900, price: 6990, qty: 6, min: 8, compat: ["iPhone 13", "iPhone 14"] },
    { sku: "PEL-CAM-15P", barcode: "7891000200052", name: "Protetor de câmera iPhone 15 Pro", category: "PELICULA", cost: 500, price: 3990, qty: 18, min: 5, compat: ["iPhone 15 Pro", "iPhone 15 Pro Max"] },
    { sku: "CAR-20W", barcode: "7891000300013", name: "Carregador USB-C 20W Apple", category: "CARREGADOR", cost: 9000, price: 19900, qty: 15, min: 5, brand: "Apple" },
    { sku: "CAR-35W", barcode: "7891000300020", name: "Carregador duplo USB-C 35W Apple", category: "CARREGADOR", cost: 22000, price: 44900, qty: 4, min: 2, brand: "Apple" },
    { sku: "CAR-MSAFE", barcode: "7891000300037", name: "Carregador MagSafe Apple 1m", category: "CARREGADOR", cost: 18000, price: 37900, qty: 6, min: 2, brand: "Apple" },
    { sku: "CAR-20W-GEN", barcode: "7891000300044", name: "Carregador USB-C 20W compatível", category: "CARREGADOR", cost: 2500, price: 7990, qty: 25, min: 8 },
    { sku: "CAB-CC-1M", barcode: "7891000400012", name: "Cabo USB-C para USB-C 1m Apple", category: "CABO", cost: 7000, price: 16900, qty: 18, min: 5, brand: "Apple" },
    { sku: "CAB-CL-1M", barcode: "7891000400029", name: "Cabo USB-C para Lightning 1m Apple", category: "CABO", cost: 7000, price: 16900, qty: 11, min: 5, brand: "Apple" },
    { sku: "CAB-CC-GEN", barcode: "7891000400036", name: "Cabo USB-C trançado 2m", category: "CABO", cost: 1500, price: 5990, qty: 30, min: 8 },
    { sku: "FON-EP-C", barcode: "7891000500011", name: "EarPods USB-C Apple", category: "FONE", cost: 9000, price: 19900, qty: 7, min: 3, brand: "Apple" },
    { sku: "AIR-4", barcode: "7891000600010", name: "AirPods 4", category: "AIRPODS", cost: 78000, price: 119900, qty: 5, min: 2, brand: "Apple" },
    { sku: "AIR-4-ANC", barcode: "7891000600027", name: "AirPods 4 com cancelamento de ruído", category: "AIRPODS", cost: 98000, price: 149900, qty: 3, min: 2, brand: "Apple" },
    { sku: "AIR-PRO3", barcode: "7891000600034", name: "AirPods Pro 3", category: "AIRPODS", cost: 160000, price: 249900, qty: 4, min: 2, brand: "Apple" },
    { sku: "WAT-S11-42", barcode: "7891000700019", name: "Apple Watch Series 11 42mm GPS", category: "WATCH", cost: 290000, price: 429900, qty: 2, min: 1, brand: "Apple" },
    { sku: "WAT-SE3-40", barcode: "7891000700026", name: "Apple Watch SE 3 40mm GPS", category: "WATCH", cost: 170000, price: 259900, qty: 1, min: 1, brand: "Apple" },
    { sku: "PCA-BAT-11", name: "Bateria iPhone 11 (peça)", category: "PECA", cost: 8000, price: 0, qty: 6, min: 2, compat: ["iPhone 11"], isPart: true },
    { sku: "PCA-BAT-12", name: "Bateria iPhone 12/12 Pro (peça)", category: "PECA", cost: 9500, price: 0, qty: 5, min: 2, compat: ["iPhone 12", "iPhone 12 Pro"], isPart: true },
    { sku: "PCA-BAT-13", name: "Bateria iPhone 13 (peça)", category: "PECA", cost: 11000, price: 0, qty: 4, min: 2, compat: ["iPhone 13"], isPart: true },
    { sku: "PCA-BAT-14P", name: "Bateria iPhone 14 Pro (peça)", category: "PECA", cost: 14000, price: 0, qty: 3, min: 2, compat: ["iPhone 14 Pro"], isPart: true },
    { sku: "PCA-TEL-12", name: "Tela OLED iPhone 12/12 Pro (peça)", category: "PECA", cost: 32000, price: 0, qty: 2, min: 1, compat: ["iPhone 12", "iPhone 12 Pro"], isPart: true },
    { sku: "PCA-TEL-13", name: "Tela OLED iPhone 13 (peça)", category: "PECA", cost: 38000, price: 0, qty: 1, min: 1, compat: ["iPhone 13"], isPart: true },
    { sku: "PCA-CON-LIG", name: "Conector de carga Lightning (peça)", category: "PECA", cost: 4000, price: 0, qty: 8, min: 2, isPart: true },
  ];

  const ids: Record<string, string> = {};
  for (const it of items) {
    const a = await db.accessory.create({
      data: {
        sku: it.sku,
        barcode: it.barcode,
        name: it.name,
        category: it.category,
        brand: it.brand,
        compatibility: JSON.stringify(it.compat ?? []),
        quantity: it.isPart ? it.qty : it.qty * 4,
        cost: it.cost,
        price: it.price,
        minStock: it.min,
        isPart: !!it.isPart,
        movements: { create: { type: "ENTRADA", quantity: it.isPart ? it.qty : it.qty * 4, unitCost: it.cost, reason: "Estoque inicial", refType: "MANUAL", userId, createdAt: daysAgo(200) } },
      },
    });
    ids[it.sku] = a.id;
  }
  return ids;
}
