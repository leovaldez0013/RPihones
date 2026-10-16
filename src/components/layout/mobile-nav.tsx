"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingCart, Smartphone, Users, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { isActive } from "./app-sidebar";

const ITEMS: { href: string; label: string; icon: typeof Menu; permission: Permission }[] = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/vendas/nova", label: "Vender", icon: ShoppingCart, permission: "sales.create" },
  { href: "/estoque/aparelhos", label: "Estoque", icon: Smartphone, permission: "devices.view" },
  { href: "/clientes", label: "Clientes", icon: Users, permission: "customers.view" },
];

/** Menu inferior para celular (balcão). */
export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const items = ITEMS.filter((i) => can(role, i.permission));

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5">
        {items.map((i) => {
          const active = isActive(pathname, i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
                active && "text-primary",
              )}
            >
              <i.icon className="size-5" />
              {i.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="size-5" />
          Menu
        </button>
      </div>
    </nav>
  );
}
