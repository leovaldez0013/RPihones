import Link from "next/link";
import {
  PackagePlus,
  Repeat,
  Wrench,
  ShoppingBag,
  Undo2,
  Tag,
  ScanLine,
  Bookmark,
  CircleDot,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";

const ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  ENTRADA: { icon: PackagePlus, color: "bg-emerald-500" },
  TROCA: { icon: Repeat, color: "bg-sky-500" },
  OS_ABERTA: { icon: Wrench, color: "bg-violet-500" },
  OS_CONCLUIDA: { icon: CheckCircle2, color: "bg-violet-500" },
  VENDA: { icon: ShoppingBag, color: "bg-primary" },
  DEVOLUCAO: { icon: Undo2, color: "bg-amber-500" },
  PRECO: { icon: Tag, color: "bg-zinc-500" },
  IMEI_CHECK: { icon: ScanLine, color: "bg-teal-500" },
  RESERVA: { icon: Bookmark, color: "bg-amber-500" },
};

export type TimelineItem = {
  id: string;
  type: string;
  description: string;
  createdAt: Date | string;
  user?: string | null;
  href?: string | null;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Sem eventos.</p>;
  return (
    <ol className="relative flex flex-col gap-5">
      <span className="absolute top-2 bottom-2 left-[13px] w-px bg-border" />
      {items.map((e) => {
        const cfg = ICONS[e.type] ?? { icon: CircleDot, color: "bg-zinc-400" };
        const content = (
          <>
            <p className="text-sm">{e.description}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(e.createdAt)}
              {e.user ? ` · ${e.user}` : ""}
            </p>
          </>
        );
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-card ${cfg.color}`}>
              <cfg.icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              {e.href ? (
                <Link href={e.href} className="hover:underline">
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
