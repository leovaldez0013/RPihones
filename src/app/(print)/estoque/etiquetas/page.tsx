import type { Metadata } from "next";
import { db } from "@/lib/db";
import { barcodeSvg } from "@/lib/barcode";
import { formatBRL } from "@/domain/money";
import { DEVICE_CONDITION } from "@/domain/constants";
import { LabelsToolbar } from "./toolbar";

export const metadata: Metadata = { title: "Etiquetas" };

type Label = { key: string; title: string; subtitle: string; code: string; price: number; qr: boolean };

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ aparelhos?: string; acessorios?: string; qtd?: string; formato?: string }>;
}) {
  const sp = await searchParams;
  const deviceIds = (sp.aparelhos ?? "").split(",").filter(Boolean);
  const accIds = (sp.acessorios ?? "").split(",").filter(Boolean);
  const copies = Math.min(Math.max(Number(sp.qtd ?? 1) || 1, 1), 50);
  const format = sp.formato === "a4" ? "a4" : "termica";

  const [devices, accessories, store] = await Promise.all([
    deviceIds.length ? db.device.findMany({ where: { id: { in: deviceIds } }, include: { model: true } }) : [],
    accIds.length ? db.accessory.findMany({ where: { id: { in: accIds } } }) : [],
    db.storeSettings.findUnique({ where: { id: "default" }, select: { name: true } }),
  ]);

  const labels: Label[] = [
    ...devices.map((d) => ({
      key: d.id,
      title: `${d.model.name} ${d.capacity}`,
      subtitle: `${d.color} · ${DEVICE_CONDITION.label(d.condition)}${d.batteryHealth ? ` · Bat. ${d.batteryHealth}%` : ""}`,
      // sem IMEI: nº de série ou código interno (o PDV encontra o aparelho por ambos)
      code: d.imei ?? d.serial ?? d.id,
      price: d.salePrice,
      qr: true,
    })),
    ...accessories.flatMap((a) =>
      Array.from({ length: copies }, (_, i) => ({
        key: `${a.id}-${i}`,
        title: a.name,
        subtitle: `SKU ${a.sku}`,
        code: a.barcode || a.sku,
        price: a.price,
        qr: false,
      })),
    ),
  ];

  return (
    <>
      <style>{`
        @page { size: ${format === "a4" ? "A4" : "50mm 30mm"}; margin: ${format === "a4" ? "8mm" : "0"}; }
        .label { width: 50mm; height: 30mm; box-sizing: border-box; padding: 1.5mm 2mm; overflow: hidden; }
        .label svg { width: 100%; height: 100%; display: block; }
        @media print {
          .sheet { gap: ${format === "a4" ? "2mm" : "0"} !important; padding: 0 !important; }
          .label { border: ${format === "a4" ? "0.2mm dashed #ccc" : "none"} !important; ${format === "termica" ? "page-break-after: always;" : ""} }
        }
      `}</style>
      <LabelsToolbar count={labels.length} format={format} />
      <div className={`sheet flex flex-wrap gap-3 p-6 ${format === "a4" ? "" : ""}`}>
        {labels.map((l) => (
          <div key={l.key} className="label flex flex-col rounded border border-zinc-300 bg-white font-sans text-black">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[7pt] text-zinc-500">{store?.name}</p>
                <p className="truncate text-[8.5pt] font-bold">{l.title}</p>
                <p className="truncate text-[6.5pt]">{l.subtitle}</p>
              </div>
              {l.qr && (
                <div className="size-[11mm] shrink-0" dangerouslySetInnerHTML={{ __html: barcodeSvg(l.code, "qrcode") }} />
              )}
            </div>
            <div className="mt-auto">
              <div className="h-[6mm] w-full" dangerouslySetInnerHTML={{ __html: barcodeSvg(l.code) }} />
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-mono text-[6pt] tracking-wide">{l.code}</p>
                <p className="text-[11pt] leading-none font-bold whitespace-nowrap">{formatBRL(l.price)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
