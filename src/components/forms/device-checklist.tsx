"use client";

import { Check, X } from "lucide-react";
import { TRADE_IN_CHECKLIST } from "@/domain/constants";
import { cn } from "@/lib/utils";

export type Checklist = Record<string, boolean>;

export const emptyChecklist = (): Checklist => Object.fromEntries(TRADE_IN_CHECKLIST.map((c) => [c.key, true]));

/** Checklist de funcionamento (OK / com problema) para avaliação de usado e entrada de OS. */
export function DeviceChecklist({ value, onChange }: { value: Checklist; onChange: (v: Checklist) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {TRADE_IN_CHECKLIST.map((item) => {
        const ok = value[item.key] !== false;
        const critical = item.key === "icloud" || item.key === "semBloqueio";
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange({ ...value, [item.key]: !ok })}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition",
              ok ? "border-emerald-500/30 bg-emerald-500/5" : critical ? "border-red-500/60 bg-red-500/10" : "border-amber-500/50 bg-amber-500/10",
            )}
          >
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-white", ok ? "bg-emerald-500" : critical ? "bg-red-500" : "bg-amber-500")}>
              {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            </span>
            <span className="flex-1">{item.label}</span>
            <span className="text-xs text-muted-foreground">{ok ? "OK" : "Problema"}</span>
          </button>
        );
      })}
    </div>
  );
}
