"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Search, ShoppingCart, PackagePlus, Wrench, Moon, Sun, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLES } from "@/domain/constants";
import { can } from "@/lib/permissions";
import { logoutAction } from "@/app/(auth)/login/actions";
import { CommandPalette } from "./command-palette";
import { NotificationsBell, type NotificationItem } from "./notifications-bell";

type Props = {
  user: { name: string; email: string; role: string };
  notifications: NotificationItem[];
};

export function Topbar({ user, notifications }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const quick = [
    { href: "/vendas/nova", label: "Nova venda", icon: ShoppingCart, show: can(user.role, "sales.create"), primary: true },
    { href: "/estoque/aparelhos/novo", label: "Entrada de aparelho", icon: PackagePlus, show: can(user.role, "devices.edit") },
    { href: "/os/nova", label: "Nova OS", icon: Wrench, show: can(user.role, "serviceOrders.edit") },
  ].filter((q) => q.show);

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl md:rounded-t-xl md:px-4">
      <SidebarTrigger className="-ml-1" />
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-muted/50 px-3 text-sm text-muted-foreground transition hover:bg-muted md:max-w-md"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Buscar IMEI, cliente, CPF, venda…</span>
        <kbd className="ml-auto hidden rounded-md border bg-background px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {quick.map((q) => (
          <Tooltip key={q.href}>
            <TooltipTrigger asChild>
              <Button asChild variant={q.primary ? "default" : "outline"} size="lg" className="hidden rounded-xl sm:inline-flex">
                <Link href={q.href}>
                  <q.icon />
                  <span className="hidden lg:inline">{q.label}</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="lg:hidden">{q.label}</TooltipContent>
          </Tooltip>
        ))}

        <NotificationsBell items={notifications} />

        <Button
          variant="ghost"
          size="icon-lg"
          className="rounded-xl"
          aria-label="Alternar tema"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Menu do usuário">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials || <UserIcon className="size-4" />}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-medium">{user.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
              <span className="text-xs font-normal text-muted-foreground">{ROLES.label(user.role)}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => logoutAction()}>
              <LogOut /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} role={user.role} />
    </header>
  );
}
