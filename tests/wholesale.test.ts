import { describe, expect, it } from "vitest";
import { batteryBand, batteryLabel, capacityGb, generatedAtLabel, generationOf, groupWholesale, sortWholesale, wholesaleFileName, type WholesaleDevice } from "@/domain/wholesale";
import { deviceSchema } from "@/features/devices/schemas";
import { buildWholesalePdf } from "@/features/wholesale/pdf";

let n = 0;
const dev = (over: Partial<WholesaleDevice>): WholesaleDevice => ({
  id: `d${++n}`,
  model: "iPhone 15 Pro",
  modelId: "m15p",
  generation: 15,
  year: 2023,
  modelOrder: 2,
  capacity: "256GB",
  color: "Titânio natural",
  battery: 92,
  price: 450000,
  ...over,
});

describe("Lista para atacado", () => {
  it("faixas de bateria: verde ≥ 90, amarelo 80–89, vermelho < 80", () => {
    expect(batteryBand(100)).toBe("ALTA");
    expect(batteryBand(90)).toBe("ALTA");
    expect(batteryBand(89)).toBe("MEDIA");
    expect(batteryBand(80)).toBe("MEDIA");
    expect(batteryBand(79)).toBe("BAIXA");
    expect(batteryBand(null)).toBe("SEM");
  });

  it("ordena do modelo mais novo ao mais antigo e depois por armazenamento (1TB depois de 512GB)", () => {
    const sorted = sortWholesale([
      dev({ model: "iPhone 13", modelId: "m13", generation: 13, year: 2021, capacity: "128GB" }),
      dev({ model: "iPhone 17e", modelId: "m17e", generation: 17, year: 2026, modelOrder: 10, capacity: "256GB" }),
      dev({ model: "iPhone 17 Pro Max", modelId: "m17pm", generation: 17, year: 2025, modelOrder: 9, capacity: "1TB" }),
      dev({ model: "iPhone 18 Pro Max", modelId: "m18pm", generation: 18, year: 2026, modelOrder: 12, capacity: "256GB" }),
      dev({ model: "iPhone 17 Pro Max", modelId: "m17pm", generation: 17, year: 2025, modelOrder: 9, capacity: "512GB" }),
      dev({ model: "iPhone 17", modelId: "m17", generation: 17, year: 2025, modelOrder: 6, capacity: "256GB" }),
    ]);
    expect(sorted.map((d) => `${d.model} ${d.capacity}`)).toEqual([
      "iPhone 18 Pro Max 256GB",
      "iPhone 17e 256GB",
      "iPhone 17 256GB",
      "iPhone 17 Pro Max 512GB",
      "iPhone 17 Pro Max 1TB",
      "iPhone 13 128GB",
    ]);
    expect(generationOf("iPhone 18")).toBe(18);
    expect(capacityGb("2TB")).toBe(2048);
  });

  it("agrupa aparelhos idênticos (modelo, GB, cor, faixa de bateria e valor) somando a quantidade", () => {
    const rows = groupWholesale([
      dev({ battery: 91 }),
      dev({ battery: 96 }),
      dev({ battery: 85 }), // outra faixa
      dev({ battery: 93, price: 440000 }), // outro valor
      dev({ battery: 94, color: "Titânio preto" }), // outra cor
    ]);
    expect(rows).toHaveLength(4);
    const main = rows.find((r) => r.quantity === 2)!;
    expect(main).toMatchObject({ band: "ALTA", batteryMin: 91, batteryMax: 96, price: 450000 });
    expect(batteryLabel(main)).toBe("91–96%");
    expect(batteryLabel({ batteryMin: 85, batteryMax: 85 })).toBe("85%");
    expect(rows.reduce((a, r) => a + r.quantity, 0)).toBe(5);
  });

  it("data/hora e nome do arquivo no horário de Brasília", () => {
    const d = new Date("2026-10-27T17:05:00Z"); // 14:05 em Brasília
    expect(generatedAtLabel(d)).toBe("27/10/2026 às 14:05");
    expect(wholesaleFileName(d)).toBe("estoque-atacado-2026-10-27-1405.pdf");
    expect(wholesaleFileName(new Date("2026-10-28T02:30:00Z"))).toBe("estoque-atacado-2026-10-27-2330.pdf");
  });

  it("PDF: A4, título, data em destaque, rodapé com página em todas as folhas e valores em reais", async () => {
    const models = ["iPhone 18 Pro Max", "iPhone 17 Pro", "iPhone 16", "iPhone 15 Pro", "iPhone 14", "iPhone 13 Pro Max"];
    const devices = Array.from({ length: 60 }, (_, i) =>
      dev({ model: models[i % 6], modelId: `m${i % 6}`, generation: 18 - (i % 6), capacity: ["128GB", "256GB", "512GB"][i % 3], color: `Cor ${i % 5}`, battery: 70 + (i % 30), price: 325000 + (i % 4) * 10000 }),
    );
    const rows = groupWholesale(devices);
    const now = new Date("2026-10-27T17:05:00Z");
    const { doc, fileName } = await buildWholesalePdf(rows, { store: { name: "RP iPhones", phone: "1133334444", whatsapp: "11988887777" }, showPrice: true, now });
    expect(fileName).toBe("estoque-atacado-2026-10-27-1405.pdf");
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(210);
    const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
    expect(raw).toContain("Lista de Estoque");
    expect(raw).toContain("Gerado em: 27/10/2026 ");
    expect(raw).toContain(` ${pages} de ${pages}`); // "Página N de N" (o acento vai codificado no PDF)
    expect(raw).toContain("R$ 3.250,00");
    expect(raw).toContain("\\(11\\) 98888-7777"); // o PDF escapa os parênteses
    if (process.env.WHOLESALE_PDF_OUT) (await import("node:fs")).writeFileSync(process.env.WHOLESALE_PDF_OUT, Buffer.from(doc.output("arraybuffer")));

    const noPrice = await buildWholesalePdf(rows, { store: { name: "RP iPhones", phone: "", whatsapp: "" }, showPrice: false, now });
    expect(Buffer.from(noPrice.doc.output("arraybuffer")).toString("latin1")).not.toContain("R$ 3.250,00");
  });

  it("valor atacado vazio ou zero fica nulo no cadastro (a lista usa o preço de venda)", () => {
    const base = { modelId: "m", capacity: "128GB", color: "Preto", condition: "SEMINOVO", acquisitionCost: 100000, salePrice: 200000 };
    expect(deviceSchema.parse({ ...base, wholesalePrice: 0 }).wholesalePrice).toBeNull();
    expect(deviceSchema.parse(base).wholesalePrice ?? null).toBeNull();
    expect(deviceSchema.parse({ ...base, wholesalePrice: 180000 }).wholesalePrice).toBe(180000);
  });
});
