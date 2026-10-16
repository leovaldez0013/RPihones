import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { getPurchaseFormData } from "@/features/purchases/queries";
import { UsedPurchaseForm } from "./used-form";

export const metadata: Metadata = { title: "Comprar aparelho de pessoa física" };

export default async function UsedPurchasePage() {
  await requirePage("devices.edit");
  const data = await getPurchaseFormData();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back="/compras"
        title="Comprar aparelho de pessoa física"
        description="Compra fora de venda: o aparelho entra no estoque, o pagamento sai do caixa/banco e é gerado o termo de compra com declaração de procedência."
      />
      <UsedPurchaseForm catalog={data.catalog} accounts={data.accounts} />
    </div>
  );
}
