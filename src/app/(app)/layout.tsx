import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { requirePage } from "@/lib/session";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { db, simulationActive } from "@/lib/db";
import { storeLogo } from "@/lib/brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const simulation = await simulationActive();

  const [store, notifications] = await Promise.all([
    db.storeSettings.findUnique({ where: { id: "default" }, select: { name: true, logoUrl: true } }),
    db.notification.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={user.role} storeName={store?.name ?? "RP iPhones"} logo={storeLogo(store?.logoUrl)} />
      <SidebarInset className="min-w-0">
        {simulation && (
          <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
            <span className="inline-flex items-center gap-1.5 font-bold tracking-wide">
              <FlaskConical className="size-4" /> MODO SIMULAÇÃO
            </span>
            <span className="hidden sm:inline">Dados fictícios, separados do estoque real.</span>
            <Link href="/simulacao" className="underline underline-offset-2">
              Resumo e sair
            </Link>
          </div>
        )}
        <Topbar
          user={user}
          notifications={notifications.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            href: n.href,
            type: n.type,
            createdAt: n.createdAt.toISOString(),
            read: !!n.readAt,
          }))}
        />
        <div className="flex-1 px-3 pt-4 pb-24 sm:px-6 md:pb-8">{children}</div>
      </SidebarInset>
      <MobileNav role={user.role} />
    </SidebarProvider>
  );
}
