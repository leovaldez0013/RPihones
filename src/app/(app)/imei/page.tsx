import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { IMEI_PROVIDERS } from "@/features/imei/providers";
import { verdict } from "@/features/imei/service";
import { ImeiTester } from "./imei-tester";

export const metadata: Metadata = { title: "Teste de IMEI" };

const TONE = { BLOQUEADO: "red", ATENCAO: "amber", LIVRE: "green", LOCAL: "gray" } as const;
const LABEL = { BLOQUEADO: "Bloqueado", ATENCAO: "Buscar iPhone ativo", LIVRE: "Sem restrição", LOCAL: "Só validação local" } as const;

export default async function ImeiPage({ searchParams }: { searchParams: Promise<{ imei?: string; deviceId?: string }> }) {
  const user = await requirePage("imei.check");
  const { imei, deviceId } = await searchParams;
  const [settings, checks] = await Promise.all([
    db.storeSettings.findUnique({ where: { id: "default" }, select: { imeiProvider: true } }),
    db.imeiCheck.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { user: true, device: { include: { model: true } } } }),
  ]);
  const provider = settings?.imeiProvider ?? "none";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Teste de IMEI"
        description="Valide o número e consulte bloqueio antes de comprar, receber na troca ou vender um aparelho."
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ImeiTester
            defaultImei={imei ?? ""}
            deviceId={deviceId ?? null}
            provider={{ id: provider, label: IMEI_PROVIDERS.find((p) => p.value === provider)?.label ?? provider }}
            canConfigure={can(user.role, "settings.store")}
          />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Consultas recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {checks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma consulta ainda.</p>
            ) : (
              <div className="-mx-2 flex max-h-[32rem] flex-col divide-y overflow-y-auto">
                {checks.map((c) => {
                  const v = verdict(c);
                  return (
                    <Link key={c.id} href={`/imei?imei=${c.imei}${c.deviceId ? `&deviceId=${c.deviceId}` : ""}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs">{c.imei}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.device ? `${c.device.model.name} ${c.device.capacity}` : (c.tacModel ?? "Fora do estoque")} · {formatDateTime(c.createdAt)}
                          {c.user && ` · ${c.user.name.split(" ")[0]}`}
                        </span>
                      </span>
                      <StatusBadge tone={TONE[v]}>{LABEL[v]}</StatusBadge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
