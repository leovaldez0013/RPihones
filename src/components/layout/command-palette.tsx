"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Smartphone, User, Receipt, Wrench, PackageSearch, Headphones } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { can } from "@/lib/permissions";
import { NAV } from "./nav";

export type SearchResult = {
  type: "device" | "customer" | "sale" | "so" | "order" | "accessory";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const ICONS = {
  device: Smartphone,
  customer: User,
  sale: Receipt,
  so: Wrench,
  order: PackageSearch,
  accessory: Headphones,
} as const;

const GROUP_LABEL: Record<SearchResult["type"], string> = {
  device: "Aparelhos",
  customer: "Clientes",
  sale: "Vendas",
  so: "Ordens de serviço",
  order: "Encomendas",
  accessory: "Acessórios",
};

export function CommandPalette({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()) as SearchResult[]);
      } catch {
        /* abortado */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  const pages = NAV.flatMap((g) => g.items).filter((i) => can(role, i.permission));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Busca global"
      description="Busque por IMEI, cliente, CPF, telefone, venda ou OS"
    >
      <Command shouldFilter={false}>
      <CommandInput
        placeholder="IMEI, cliente, CPF, telefone, nº da venda ou OS…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Buscando…
          </div>
        )}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <CommandEmpty>Nada encontrado para “{query}”.</CommandEmpty>
        )}
        {Object.entries(grouped).map(([type, items]) => {
          const Icon = ICONS[type as SearchResult["type"]];
          return (
            <CommandGroup key={type} heading={GROUP_LABEL[type as SearchResult["type"]]}>
              {items.map((r) => (
                <CommandItem key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(r.href)}>
                  <Icon />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{r.title}</span>
                    {r.subtitle && <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {query.trim().length < 2 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ir para">
              {pages.map((p) => (
                <CommandItem key={p.href} value={p.href} onSelect={() => go(p.href)}>
                  <p.icon />
                  {p.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
