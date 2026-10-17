"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCircle2, ListTodo, MessageCircle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { TASK_TYPE } from "@/domain/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logSendAction, setTaskDoneAction } from "@/features/marketing/actions";

export type TaskRow = {
  id: string;
  type: string;
  title: string;
  dueDate: string;
  done: boolean;
  customer: { id: string; name: string } | null;
  owner: string | null;
  templateKey: string;
  whatsapp: string | null;
  message: string;
  blockedReason: string | null;
};

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function TaskBoard({ rows }: { rows: TaskRow[] }) {
  const [type, setType] = useState("TODAS");
  const groups = useMemo(() => {
    const today = startOfDay();
    const tomorrow = new Date(today.getTime() + 86400000);
    const list = rows.filter((r) => type === "TODAS" || r.type === type);
    const open = list.filter((r) => !r.done);
    return [
      { key: "late", title: "Atrasadas", tone: "text-red-600 dark:text-red-400", items: open.filter((r) => new Date(r.dueDate) < today) },
      { key: "today", title: "Para hoje", tone: "", items: open.filter((r) => new Date(r.dueDate) >= today && new Date(r.dueDate) < tomorrow) },
      { key: "next", title: "Próximos dias", tone: "", items: open.filter((r) => new Date(r.dueDate) >= tomorrow) },
      { key: "done", title: "Concluídas (7 dias)", tone: "text-muted-foreground", items: list.filter((r) => r.done) },
    ];
  }, [rows, type]);
  const pending = rows.filter((r) => !r.done && new Date(r.dueDate) < new Date(startOfDay().getTime() + 86400000)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {[{ value: "TODAS", label: "Todas" }, ...TASK_TYPE.list].map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", type === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{pending} para fazer hoje</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={ListTodo} title="Nenhuma tarefa" description="Pós-venda, aniversários e garantias vencendo aparecem aqui automaticamente." />
      ) : (
        groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.key}>
              <h2 className={cn("mb-2 text-sm font-semibold", g.tone)}>
                {g.title} <span className="font-normal text-muted-foreground">({g.items.length})</span>
              </h2>
              <Card className="py-0">
                <CardContent className="divide-y px-0">
                  {g.items.map((r) => (
                    <TaskItem key={r.id} row={r} late={g.key === "late"} />
                  ))}
                </CardContent>
              </Card>
            </section>
          ))
      )}
    </div>
  );
}

function TaskItem({ row, late }: { row: TaskRow; late: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await setTaskDoneAction({ id: row.id, done: !row.done });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center", row.done && "opacity-60")}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={row.done ? "Reabrir tarefa" : "Concluir tarefa"}
        className={cn("hidden size-6 shrink-0 items-center justify-center rounded-full border-2 transition sm:flex", row.done ? "border-emerald-500 bg-emerald-500 text-white" : "hover:border-primary")}
      >
        {row.done && <Check className="size-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={row.type} options={TASK_TYPE} className="h-5 px-2" />
          <span className={cn("text-xs", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatDate(row.dueDate)}</span>
          {row.owner && <span className="text-xs text-muted-foreground">· {row.owner.split(" ")[0]}</span>}
        </div>
        <p className={cn("mt-1 text-sm font-medium", row.done && "line-through")}>{row.title}</p>
        {row.customer && (
          <Link href={`/clientes/${row.customer.id}`} className="text-xs text-muted-foreground hover:underline">
            {row.customer.name}
          </Link>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!row.done && row.whatsapp && (
          <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <a
              href={row.whatsapp}
              target="_blank"
              rel="noreferrer"
              onClick={async () => {
                const res = await logSendAction({ customerId: row.customer!.id, templateKey: row.templateKey, message: row.message, taskId: row.id });
                if (!res.ok) return toast.error(res.error);
                toast.success("Mensagem registrada e tarefa concluída");
                router.refresh();
              }}
            >
              <MessageCircle /> WhatsApp
            </a>
          </Button>
        )}
        {!row.done && !row.whatsapp && row.blockedReason && <span className="text-xs text-muted-foreground">{row.blockedReason}</span>}
        <Button size="sm" variant="outline" onClick={toggle} disabled={busy}>
          {row.done ? (
            <>
              <Undo2 /> Reabrir
            </>
          ) : (
            <>
              <CheckCircle2 /> Concluir
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
