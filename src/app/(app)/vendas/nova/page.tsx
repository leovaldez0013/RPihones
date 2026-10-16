import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { getPosData } from "@/features/sales/queries";
import { Pos } from "./pos";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ orcamento?: string; cliente?: string; encomenda?: string }> }) {
  const user = await requirePage("sales.create");
  const sp = await searchParams;
  const data = await getPosData(user, { quoteId: sp.orcamento, customerId: sp.cliente, orderId: sp.encomenda });
  return (
    <div>
      <PageHeader
        title={data.quote ? `Orçamento #${data.quote.number}` : data.order ? `Entrega da encomenda #${data.order.number}` : "Nova venda"}
        description={data.quote ? "Edite e finalize o orçamento." : "PDV — escaneie ou busque os itens, receba o aparelho na troca e combine as formas de pagamento."}
        back={data.quote ? `/vendas/${data.quote.id}` : undefined}
      />
      <Pos
        cardRules={data.cardRules}
        catalog={data.catalog}
        sellers={data.sellers}
        currentUserId={user.id}
        discountLimitPct={data.discountLimitPct}
        customer={data.customer}
        quote={data.quote}
        order={data.order}
      />
    </div>
  );
}
