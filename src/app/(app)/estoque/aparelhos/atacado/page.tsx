import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import type { WholesaleDevice } from "@/domain/wholesale";
import { generationOf, sortWholesale } from "@/domain/wholesale";
import { WholesaleList } from "./wholesale-list";

export const metadata: Metadata = { title: "Lista para atacado" };

export default async function WholesalePage() {
  await requirePage("devices.view");
  // só aparelhos disponíveis (nunca vendidos, reservados, em OS ou em avaliação) e só os campos que podem
  // ir para o lojista — IMEI, custo, fornecedor, observações e clientes nem saem do servidor
  const [devices, store] = await Promise.all([
    db.device.findMany({
      where: { deletedAt: null, status: "DISPONIVEL" },
      select: {
        id: true,
        capacity: true,
        color: true,
        batteryHealth: true,
        salePrice: true,
        wholesalePrice: true,
        model: { select: { id: true, name: true, family: true, year: true, sortOrder: true } },
      },
    }),
    db.storeSettings.findUnique({ where: { id: "default" }, select: { name: true, phone: true, whatsapp: true } }),
  ]);

  const items: WholesaleDevice[] = sortWholesale(
    devices.map((d) => ({
      id: d.id,
      model: d.model.name,
      modelId: d.model.id,
      generation: generationOf(d.model.family),
      year: d.model.year,
      modelOrder: d.model.sortOrder,
      capacity: d.capacity,
      color: d.color,
      battery: d.batteryHealth,
      price: d.wholesalePrice || d.salePrice,
    })),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Lista para atacado"
        description="Escolha os aparelhos e gere o PDF para enviar aos lojistas. Sem IMEI, custo, fornecedor ou dados de clientes."
        back="/estoque/aparelhos"
      />
      <WholesaleList items={items} store={{ name: store?.name ?? "RP iPhones", phone: store?.phone ?? "", whatsapp: store?.whatsapp ?? "" }} />
    </div>
  );
}
