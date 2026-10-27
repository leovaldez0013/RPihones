import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db, parseJson } from "@/lib/db";
import { getCatalog, getSuppliersLite } from "@/features/devices/queries";
import type { DeviceInput } from "@/features/devices/schemas";
import { DeviceForm } from "../../device-form";
import { imeiText } from "@/lib/format";

export const metadata: Metadata = { title: "Editar aparelho" };

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditDevicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("devices.edit");
  const { id } = await params;
  const [d, catalog, suppliers] = await Promise.all([
    db.device.findUnique({ where: { id }, include: { model: true } }),
    getCatalog(true),
    getSuppliersLite(),
  ]);
  if (!d || d.deletedAt) notFound();

  const defaults: DeviceInput = {
    id: d.id,
    imei: d.imei ?? "",
    imei2: d.imei2 ?? "",
    serial: d.serial ?? "",
    modelId: d.modelId,
    capacity: d.capacity,
    color: d.color,
    condition: d.condition as DeviceInput["condition"],
    batteryHealth: d.batteryHealth ?? "",
    grade: (d.grade ?? "") as DeviceInput["grade"],
    notes: d.notes ?? "",
    photos: parseJson<string[]>(d.photos, []),
    supplierId: d.supplierId ?? "",
    acquisitionCost: d.acquisitionCost,
    salePrice: d.salePrice,
    wholesalePrice: d.wholesalePrice ?? 0,
    entryDate: ymd(d.entryDate),
    appleWarrantyUntil: ymd(d.appleWarrantyUntil),
    status: d.status as DeviceInput["status"],
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Editar ${d.model.name}`} description={imeiText(d.imei)} back={`/estoque/aparelhos/${d.id}`} />
      <DeviceForm catalog={catalog} suppliers={suppliers} defaults={defaults} />
    </div>
  );
}
