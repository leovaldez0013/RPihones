import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db, parseJson } from "@/lib/db";
import { CatalogManager } from "./catalog-manager";

export const metadata: Metadata = { title: "Catálogo de modelos" };

export default async function CatalogPage() {
  await requirePage("catalog.edit");
  const [models, tacs, counts] = await Promise.all([
    db.deviceModel.findMany({ orderBy: [{ year: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    db.tacEntry.findMany({ include: { model: true }, orderBy: { tac: "asc" } }),
    db.device.groupBy({ by: ["modelId"], _count: true, where: { deletedAt: null } }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.modelId, c._count]));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Catálogo de modelos" description="Modelos, cores, capacidades e tabela TAC usada na identificação pelo IMEI." back="/configuracoes" />
      <CatalogManager
        models={models.map((m) => ({
          id: m.id,
          name: m.name,
          family: m.family,
          year: m.year,
          colors: parseJson<string[]>(m.colors, []),
          capacities: parseJson<string[]>(m.capacities, []),
          active: m.active,
          devices: countMap[m.id] ?? 0,
        }))}
        tacs={tacs.map((t) => ({ tac: t.tac, modelId: t.modelId, model: t.model.name, note: t.note ?? "" }))}
      />
    </div>
  );
}
