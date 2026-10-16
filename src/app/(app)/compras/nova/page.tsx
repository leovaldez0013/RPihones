import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { getPurchaseFormData } from "@/features/purchases/queries";
import { PurchaseEditor } from "../purchase-editor";

export const metadata: Metadata = { title: "Novo pedido de compra" };

export default async function NewPurchasePage() {
  await requirePage("purchases.edit");
  const data = await getPurchaseFormData();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Novo pedido de compra" back="/compras" description="Aparelhos são lançados por modelo/quantidade; os IMEIs são informados no recebimento." />
      <PurchaseEditor suppliers={data.suppliers} catalog={data.catalog} accessories={data.accessories} />
    </div>
  );
}
