"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/marketing", label: "Tarefas" },
  { href: "/marketing/campanhas", label: "Campanhas e segmentos" },
  { href: "/marketing/modelos", label: "Modelos de mensagem" },
];

export function MarketingTabs() {
  const pathname = usePathname();
  return (
    <nav className="no-print -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => {
        const active = t.href === "/marketing" ? pathname === "/marketing" : pathname.startsWith(t.href);
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
