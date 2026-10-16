import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const [store, notifications] = await Promise.all([
    db.storeSettings.findUnique({ where: { id: "default" }, select: { name: true } }),
    db.notification.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={user.role} storeName={store?.name ?? "RP iPhones"} />
      <SidebarInset className="min-w-0">
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
