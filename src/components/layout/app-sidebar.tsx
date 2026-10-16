"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Smartphone } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { can } from "@/lib/permissions";
import { NAV } from "./nav";

export function isActive(pathname: string, href: string) {
  if (href === "/vendas") return pathname === "/vendas" || /^\/vendas\/(?!nova)/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ role, storeName }: { role: string; storeName: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={storeName}>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Smartphone className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{storeName}</span>
                  <span className="truncate text-xs text-muted-foreground">Gestão da loja</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => {
          const items = group.items.filter((i) => can(role, i.permission));
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={item.title}>
                        <Link href={item.href} onClick={() => setOpenMobile(false)}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
