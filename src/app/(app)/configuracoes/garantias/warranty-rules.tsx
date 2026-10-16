"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/shared/inputs";
import { saveWarrantyRulesAction } from "@/features/finance/actions";

type Rule = { condition: string; label: string; days: number; clauses: string };

export function WarrantyRules({ rules: initial }: { rules: Rule[] }) {
  const [rules, setRules] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {rules.map((r, i) => (
        <Card key={r.condition}>
          <CardHeader>
            <CardTitle>{r.label}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <FormField label="Prazo (dias)">
              <Input type="number" min={0} value={r.days} onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) || 0 } : x)))} />
            </FormField>
            <FormField label="Cláusulas / exclusões de cobertura">
              <Textarea rows={4} value={r.clauses} onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, clauses: e.target.value } : x)))} />
            </FormField>
          </CardContent>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await saveWarrantyRulesAction({ rules: rules.map(({ label: _l, ...r }) => r) });
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Prazos salvos — valem para as próximas vendas");
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar
        </Button>
      </div>
    </div>
  );
}
