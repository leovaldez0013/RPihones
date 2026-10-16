"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { saveCommissionRulesAction } from "@/features/finance/actions";

const CATS = [
  { key: "APARELHO_NOVO", label: "Aparelho novo" },
  { key: "APARELHO_SEMINOVO", label: "Seminovo" },
  { key: "ACESSORIO", label: "Acessório" },
  { key: "SERVICO", label: "Serviço" },
] as const;
type Cat = (typeof CATS)[number]["key"];
type Rule = { userId: string | null; category: string; pct: number | null };

export function CommissionRules({ rules, users }: { rules: Rule[]; users: { id: string; name: string; commissionPct: number }[] }) {
  const key = (u: string | null, c: string) => `${u ?? "geral"}|${c}`;
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rules.map((r) => [key(r.userId, r.category), String(r.pct ?? "")])));
  const [busy, setBusy] = useState(false);
  const rows = [{ id: null as string | null, name: "Regra geral (todos)", commissionPct: null as number | null }, ...users];

  async function save() {
    setBusy(true);
    const payload = rows.flatMap((r) =>
      CATS.map((c) => {
        const v = values[key(r.id, c.key)];
        return { userId: r.id, category: c.key as Cat, pct: v === undefined || v === "" ? null : Number(v.replace(",", ".")) };
      }),
    );
    const res = await saveCommissionRulesAction({ rules: payload });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Regras salvas — valem para as próximas vendas");
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 text-left font-medium">Vendedor</th>
              {CATS.map((c) => (
                <th key={c.key} className="py-2 text-left font-medium">
                  {c.label} %
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? "geral"} className="border-t">
                <td className="py-2 pr-3">
                  <p className="font-medium">{r.name}</p>
                  {r.commissionPct != null && <p className="text-xs text-muted-foreground">padrão {r.commissionPct.toString().replace(".", ",")}%</p>}
                </td>
                {CATS.map((c) => (
                  <td key={c.key} className="py-2 pr-2">
                    <Input
                      inputMode="decimal"
                      value={values[key(r.id, c.key)] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key(r.id, c.key)]: e.target.value }))}
                      placeholder={r.id ? "herda" : "—"}
                      className="h-8 w-20"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
