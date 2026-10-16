"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRelative } from "@/lib/format";
import { markNotificationsRead } from "@/features/notifications/actions";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: string;
  createdAt: string;
  read: boolean;
};

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const unread = items.filter((i) => !i.read).length;

  function markAll() {
    start(async () => {
      await markNotificationsRead({});
      router.refresh();
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative rounded-xl" aria-label="Notificações">
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notificações</span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={markAll} disabled={pending}>
              <CheckCheck /> Marcar como lidas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação por aqui.</p>
          ) : (
            items.map((n) => {
              const body = (
                <div className={`flex gap-3 px-4 py-3 text-sm hover:bg-muted/60 ${n.read ? "opacity-60" : ""}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-primary"}`} />
                  <div className="min-w-0">
                    <p className="font-medium">{n.title}</p>
                    {n.body && <p className="text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{formatRelative(n.createdAt)}</p>
                  </div>
                </div>
              );
              return n.href ? (
                <Link key={n.id} href={n.href} className="block">
                  {body}
                </Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
