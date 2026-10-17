import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { MarketingTabs } from "./marketing-tabs";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requirePage("marketing.view");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Marketing e pós-venda" description="Tarefas do dia, campanhas pelo WhatsApp e modelos de mensagem. Só enviamos marketing a quem autorizou (LGPD)." />
      <MarketingTabs />
      {children}
    </div>
  );
}
