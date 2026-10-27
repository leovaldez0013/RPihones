// PDF da lista de atacado, gerado no navegador (jsPDF + autoTable). Não grava nada no estoque.
import { formatBRL } from "@/domain/money";
import { formatPhone } from "@/lib/format";
import { batteryLabel, generatedAtLabel, wholesaleFileName, type BatteryBand, type WholesaleRow } from "@/domain/wholesale";

export type WholesaleStore = { name: string; phone: string; whatsapp: string };

type RGB = [number, number, number];
const INK: RGB = [24, 24, 27];
const MUTED: RGB = [113, 113, 122];
const ACCENT: RGB = [37, 99, 235];
const BAND_STYLE: Record<BatteryBand, { fill: RGB; text: RGB } | null> = {
  ALTA: { fill: [220, 252, 231], text: [22, 101, 52] },
  MEDIA: { fill: [254, 243, 199], text: [146, 64, 14] },
  BAIXA: { fill: [254, 226, 226], text: [153, 27, 27] },
  SEM: null,
};

// o Intl separa "R$" do número com espaço não separável; no PDF usamos espaço comum
const money = (cents: number) => formatBRL(cents).replace(/ /g, " ");
const gb = (capacity: string) => capacity.replace(/\s*GB$/i, "").replace(/\s*TB$/i, " TB");

type PdfOptions = { store: WholesaleStore; showPrice: boolean; now?: Date };

/** Gera e baixa o arquivo "estoque-atacado-AAAA-MM-DD-HHMM.pdf". */
export async function downloadWholesalePdf(rows: WholesaleRow[], opts: PdfOptions) {
  const { doc, fileName } = await buildWholesalePdf(rows, opts);
  doc.save(fileName);
}

export async function buildWholesalePdf(rows: WholesaleRow[], opts: PdfOptions) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const now = opts.now ?? new Date();
  const generated = generatedAtLabel(now);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;

  // ── cabeçalho: loja e contatos ──
  let y = M + 2;
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...INK);
  doc.text(opts.store.name, M, y);
  const contacts = [opts.store.whatsapp && `WhatsApp ${formatPhone(opts.store.whatsapp)}`, opts.store.phone && opts.store.phone !== opts.store.whatsapp && `Tel. ${formatPhone(opts.store.phone)}`].filter(Boolean).join("   ·   ");
  if (contacts) {
    y += 6;
    doc.setFont("helvetica", "normal").setFontSize(10.5).setTextColor(...MUTED);
    doc.text(contacts, M, y);
  }
  y += 4;
  doc.setDrawColor(228, 228, 231).setLineWidth(0.3).line(M, y, pageW - M, y);

  // ── título e data/hora em destaque ──
  y += 10;
  doc.setFont("helvetica", "bold").setFontSize(19).setTextColor(...INK);
  doc.text("Lista de Estoque – Atacado", M, y);
  y += 4;
  const stamp = `Gerado em: ${generated}`;
  doc.setFontSize(12.5);
  const stampW = doc.getTextWidth(stamp) + 10;
  doc.setFillColor(...ACCENT).roundedRect(M, y, stampW, 9, 2, 2, "F");
  doc.setTextColor(255, 255, 255).text(stamp, M + 5, y + 6.1);
  y += 9;

  const units = rows.reduce((a, r) => a + r.quantity, 0);
  y += 6.5;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text(`${units} aparelho${units === 1 ? "" : "s"} disponíve${units === 1 ? "l" : "is"}${opts.showPrice ? "" : " · lista de disponibilidade (sem preços)"}`, M, y);

  // ── tabela ──
  const columns = [
    { header: "Modelo", dataKey: "model" },
    { header: "GB", dataKey: "gb" },
    { header: "Cor", dataKey: "color" },
    { header: "Bateria", dataKey: "battery" },
    { header: "Qtd", dataKey: "qty" },
    ...(opts.showPrice ? [{ header: "Valor", dataKey: "price" }] : []),
  ];
  const body = rows.map((r) => ({ model: r.model, gb: gb(r.capacity), color: r.color, battery: batteryLabel(r), qty: String(r.quantity), price: money(r.price), band: r.band }));

  autoTable(doc, {
    startY: y + 4,
    columns,
    body,
    theme: "plain",
    margin: { left: M, right: M, bottom: 20 },
    styles: { font: "helvetica", fontSize: 11, textColor: INK, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: [244, 244, 245], textColor: [63, 63, 70], fontStyle: "bold", fontSize: 10 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      model: { fontStyle: "bold", cellWidth: "auto" },
      gb: { halign: "center", cellWidth: 16 },
      battery: { halign: "center", cellWidth: 24 },
      qty: { halign: "center", cellWidth: 14 },
      price: { halign: "right", fontStyle: "bold", cellWidth: 32 },
    },
    didParseCell: (data) => {
      if (data.section === "head" && ["gb", "battery", "qty"].includes(String(data.column.dataKey))) data.cell.styles.halign = "center";
      if (data.section === "head" && data.column.dataKey === "price") data.cell.styles.halign = "right";
      if (data.section !== "body" || data.column.dataKey !== "battery") return;
      const style = BAND_STYLE[(data.row.raw as { band: BatteryBand }).band];
      if (!style) return;
      data.cell.styles.fillColor = style.fill;
      data.cell.styles.textColor = style.text;
      data.cell.styles.fontStyle = "bold";
    },
  });

  // ── rodapé em todas as páginas ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(228, 228, 231).setLineWidth(0.3).line(M, pageH - 13, pageW - M, pageH - 13);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
    doc.text(`Gerado em ${generated} – Valores sujeitos a alteração e à disponibilidade.`, M, pageH - 8);
    doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 8, { align: "right" });
  }

  return { doc, fileName: wholesaleFileName(now) };
}
