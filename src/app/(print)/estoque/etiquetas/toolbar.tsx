"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LabelsToolbar({ count, format }: { count: number; format: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setFormat(f: string) {
    const p = new URLSearchParams(sp);
    p.set("formato", f);
    router.replace(`${pathname}?${p}`);
  }

  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-white/90 px-6 py-3 backdrop-blur">
      <p className="text-sm font-medium">{count} etiqueta(s)</p>
      <div className="flex rounded-lg border p-0.5 text-sm">
        {[
          ["termica", "Impressora térmica 50×30 mm"],
          ["a4", "Folha A4"],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFormat(v)}
            className={`rounded-md px-3 py-1 ${format === v ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <Button className="ml-auto" onClick={() => window.print()}>
        <Printer /> Imprimir
      </Button>
    </div>
  );
}
