import type { Metadata } from "next";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listDevices } from "@/features/devices/queries";
import { DevicesTable } from "./devices-table";

export const metadata: Metadata = { title: "Estoque de aparelhos" };

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; filtro?: string }> }) {
  const user = await requirePage("devices.view");
  const sp = await searchParams;
  const [rows, settings] = await Promise.all([
    listDevices(user.role, { includeSold: true }),
    db.storeSettings.findUnique({ where: { id: "default" }, select: { staleStockDays: true } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Aparelhos"
        description="Estoque de iPhones controlado por IMEI."
        actions={
          can(user.role, "devices.edit") && (
            <Button asChild size="lg">
              <Link href="/estoque/aparelhos/novo">
                <PackagePlus /> Entrada de aparelho
              </Link>
            </Button>
          )
        }
      />
      <DevicesTable
        rows={rows}
        staleDays={settings?.staleStockDays ?? 45}
        showCost={can(user.role, "devices.viewCost")}
        initialSearch={sp.q}
        initialStatus={sp.status}
        initialStale={sp.filtro === "parados"}
      />
    </div>
  );
}
