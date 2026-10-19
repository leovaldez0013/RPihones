import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { getCatalog, getSuppliersLite } from "@/features/devices/queries";
import { DeviceForm } from "../device-form";

export const metadata: Metadata = { title: "Entrada de aparelho" };

export default async function NewDevicePage({ searchParams }: { searchParams: Promise<{ imei?: string }> }) {
  await requirePage("devices.edit");
  const { imei } = await searchParams;
  const [catalog, suppliers] = await Promise.all([getCatalog(), getSuppliersLite()]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Entrada de aparelho"
        description="Cadastro avulso. Para compras de fornecedor use Compras; para troca, use o PDV."
        back="/estoque/aparelhos"
      />
      <DeviceForm catalog={catalog} suppliers={suppliers} initialImei={imei?.replace(/\D/g, "").slice(0, 15)} />
    </div>
  );
}
