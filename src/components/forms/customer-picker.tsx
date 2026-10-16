"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, UserPlus, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCPF, formatPhone } from "@/lib/format";
import { searchCustomers } from "@/features/customers/actions";
import { CustomerForm } from "./customer-form";

export type PickedCustomer = { id: string; name: string; cpf: string | null; phone: string | null };

/** Seleciona cliente existente (busca por nome, CPF ou telefone) ou cadastra na hora. */
export function CustomerPicker({
  value,
  onChange,
  placeholder = "Buscar cliente por nome, CPF ou telefone…",
}: {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchCustomers({ q });
      if (cancel) return;
      setLoading(false);
      if (res.ok) setResults(res.data);
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{value.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[value.cpf && formatCPF(value.cpf), value.phone && formatPhone(value.phone)].filter(Boolean).join(" · ") || "sem documento"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Trocar cliente">
          <X />
        </Button>
      </div>
    );
  }

  const digits = q.replace(/\D/g, "");
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-9 pl-9" />
          {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <Button type="button" variant="outline" size="lg" onClick={() => setCreating(true)}>
          <UserPlus /> <span className="hidden sm:inline">Novo</span>
        </Button>
      </div>
      {q.trim().length >= 2 && !loading && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c);
                setQ("");
              }}
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">
                {[c.cpf && formatCPF(c.cpf), c.phone && formatPhone(c.phone)].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-muted"
          >
            <UserPlus className="size-4" /> Cadastrar “{q}” como novo cliente
          </button>
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto px-1">
            <CustomerForm
              compact
              defaults={
                digits.length === 11 && !/[a-z]/i.test(q)
                  ? q.includes("(")
                    ? { phone: digits }
                    : { cpf: digits }
                  : digits.length >= 10 && !/[a-z]/i.test(q)
                    ? { phone: digits }
                    : { name: q }
              }
              onCancel={() => setCreating(false)}
              onSaved={(c) => {
                setCreating(false);
                setQ("");
                onChange(c);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
