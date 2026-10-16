"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; permission: Permission }[] = [
  { href: "/financeiro", label: "Contas a pagar e receber", permission: "finance.view" },
  { href: "/financeiro/caixa", label: "Caixa", permission: "cash.operate" },
  { href: "/financeiro/fluxo", label: "Fluxo de caixa", permission: "finance.view" },
  { href: "/financeiro/dre", label: "DRE e lucro", permission: "finance.view" },
  { href: "/financeiro/comissoes", label: "Comissões", permission: "finance.view" },
  { href: "/financeiro/contas", label: "Contas, taxas e categorias", permission: "finance.view" },
];

export function FinanceTabs({ role }: { role: string }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => can(role, t.permission));
  if (tabs.length < 2) return null;
  return (
    <nav className="no-print -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const active = t.href === "/financeiro" ? pathname === "/financeiro" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
