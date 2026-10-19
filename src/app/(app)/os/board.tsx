"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CheckCircle2, Package, Search, User, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { SO_KIND, SO_PRIORITY, SO_STATUS } from "@/domain/constants";
import { SO_BOARD } from "@/domain/service-order";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveServiceOrderAction } from "@/features/service-orders/actions";
import { DeliverDialog } from "./deliver-dialog";

export type SoCard = {
  id: string;
  number: number;
  kind: string;
  status: string;
  priority: string;
  title: string;
  imei: string | null;
  problem: string;
  customer: string | null;
  technician: string | null;
  technicianId: string | null;
  price: number;
  parts: number;
  dueDate: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

const COLUMNS = [...SO_BOARD, "ENTREGUE"] as const;

// prioriza o que está sob o ponteiro (mais previsível entre colunas); teclado cai no closestCorners
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (!hits.length) return closestCorners(args);
  // sobre um cartão, ele vence a coluna (define a posição de inserção)
  const cards = hits.filter((h) => !(COLUMNS as readonly string[]).includes(String(h.id)));
  return cards.length ? cards : hits;
};
type Columns = Record<string, string[]>;

function group(cards: SoCard[]): Columns {
  const cols: Columns = Object.fromEntries(COLUMNS.map((c) => [c, []]));
  for (const c of cards) cols[c.status]?.push(c.id);
  return cols;
}

export function Board({ cards, userId, canEdit }: { cards: SoCard[]; userId: string; canEdit: boolean }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [columns, setColumns] = useState<Columns>(() => group(cards));
  const [snapshot, setSnapshot] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deliver, setDeliver] = useState<SoCard | null>(null);
  const [kind, setKind] = useState("TODAS");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");

  // dados novos do servidor (após refresh) substituem o estado local
  useEffect(() => setColumns(group(cards)), [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = (id: string) => {
    const c = byId.get(id);
    if (!c) return false;
    if (kind !== "TODAS" && c.kind !== kind) return false;
    if (mine && c.technicianId !== userId) return false;
    const term = q.trim().toLowerCase();
    if (term && !`#${c.number} ${c.title} ${c.imei ?? ""} ${c.problem} ${c.customer ?? ""} ${c.technician ?? ""}`.toLowerCase().includes(term)) return false;
    return true;
  };

  const findColumn = (id: string) => (id in columns ? id : Object.keys(columns).find((k) => columns[k].includes(id)));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setSnapshot(columns);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const target = prev[to];
      const overIndex = target.indexOf(String(over.id));
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...prev,
        [from]: prev[from].filter((x) => x !== active.id),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    setActiveId(null);
    const before = snapshot ?? columns;
    const card = byId.get(id);
    const { over } = e;
    if (!over || !card) return setColumns(before);

    const to = findColumn(String(over.id));
    if (!to) return setColumns(before);

    let next = columns;
    const list = columns[to];
    const from = list.indexOf(id);
    const overIndex = list.indexOf(String(over.id));
    if (from >= 0 && overIndex >= 0 && from !== overIndex) {
      next = { ...columns, [to]: arrayMove(list, from, overIndex) };
      setColumns(next);
    }

    if (to === "ENTREGUE") {
      setColumns(before);
      if (card.status !== "ENTREGUE") setDeliver(card);
      return;
    }
    const index = next[to].indexOf(id);
    const beforeIndex = before[card.status]?.indexOf(id);
    if (to === card.status && index === beforeIndex) return;

    const res = await moveServiceOrderAction({ id, status: to as "ABERTA", index });
    if (!res.ok) {
      toast.error(res.error);
      setColumns(before);
      return;
    }
    if (to !== card.status) toast.success(`OS #${card.number} → ${SO_STATUS.label(to)}`);
    router.refresh();
  }

  const active = activeId ? byId.get(activeId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, aparelho, IMEI, cliente…" className="h-10 pl-9" />
        </div>
        <div className="flex gap-1.5">
          {[{ value: "TODAS", label: "Todas" }, ...SO_KIND.list.map((k) => ({ value: k.value, label: k.value === "INTERNA" ? "Internas" : "Clientes" }))].map((k) => (
            <Chip key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>
              {k.label}
            </Chip>
          ))}
          <Chip active={mine} onClick={() => setMine((m) => !m)}>
            <User className="size-3.5" /> Minhas
          </Chip>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), snapshot && setColumns(snapshot))}>
        <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:scroll-px-0 sm:px-0">
          {COLUMNS.map((status) => {
            const ids = columns[status].filter(visible);
            return (
              <Column key={status} status={status} count={ids.length} ids={ids}>
                {ids.map((id) => (
                  <SortableCard key={id} card={byId.get(id)!} disabled={!canEdit || status === "ENTREGUE"} />
                ))}
              </Column>
            );
          })}
        </div>
        <DragOverlay>{active ? <CardView card={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <DeliverDialog so={deliver} open={!!deliver} onOpenChange={(o) => !o && setDeliver(null)} />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm", active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
    >
      {children}
    </button>
  );
}

function Column({ status, count, ids, children }: { status: string; count: number; ids: string[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const done = status === "ENTREGUE";
  return (
    <section className="flex w-[17.5rem] shrink-0 snap-start flex-col rounded-2xl bg-muted/50 p-2">
      <header className="flex items-center justify-between px-2 pt-1 pb-2.5">
        <StatusBadge value={status} options={SO_STATUS} />
        <span className="text-xs text-muted-foreground tabular">
          {count}
          {done && " · 14 dias"}
        </span>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex min-h-32 flex-1 flex-col gap-2 rounded-xl p-0.5 transition-colors", isOver && "bg-primary/5 ring-2 ring-primary/30")}>
          {children}
          {count === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{done ? "Solte aqui para entregar" : "Nenhuma OS"}</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ card, disabled }: { card: SoCard; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <CardView card={card} />
    </div>
  );
}

function CardView({ card, dragging }: { card: SoCard; dragging?: boolean }) {
  const overdue = card.dueDate && card.status !== "ENTREGUE" && new Date(card.dueDate) < new Date(new Date().toDateString());
  return (
    <Link
      href={`/os/${card.id}`}
      draggable={false}
      className={cn(
        "block rounded-xl border bg-card p-3 text-sm shadow-xs transition hover:border-primary/40",
        dragging && "rotate-2 cursor-grabbing shadow-lg ring-2 ring-primary/30",
        card.priority === "URGENTE" && "border-l-4 border-l-red-500",
        card.priority === "ALTA" && "border-l-4 border-l-amber-500",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">OS #{card.number}</span>
        <span className="flex items-center gap-1">
          {(card.priority === "ALTA" || card.priority === "URGENTE") && <StatusBadge value={card.priority} options={SO_PRIORITY} className="h-5 px-2" />}
          <StatusBadge value={card.kind} options={SO_KIND} className="h-5 px-2">
            {card.kind === "INTERNA" ? "Interna" : card.kind === "GARANTIA" ? "Garantia" : "Cliente"}
          </StatusBadge>
        </span>
      </div>
      <p className="font-medium leading-snug">{card.title}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{card.problem}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {card.customer && (
          <span className="inline-flex items-center gap-1">
            <User className="size-3" /> {card.customer.split(" ").slice(0, 2).join(" ")}
          </span>
        )}
        {card.technician && (
          <span className="inline-flex items-center gap-1">
            <Wrench className="size-3" /> {card.technician.split(" ")[0]}
          </span>
        )}
        {card.parts > 0 && (
          <span className="inline-flex items-center gap-1">
            <Package className="size-3" /> {card.parts}
          </span>
        )}
        {card.deliveredAt ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" /> {formatDate(card.deliveredAt)}
          </span>
        ) : card.dueDate && (
          <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-red-600 dark:text-red-400")}>
            <CalendarClock className="size-3" /> {formatDate(card.dueDate)}
          </span>
        )}
      </div>
    </Link>
  );
}
