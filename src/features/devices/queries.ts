import "server-only";
import { db, parseJson } from "@/lib/db";
import { can } from "@/lib/permissions";
import { daysSince } from "@/lib/format";

export type CatalogItem = { id: string; name: string; family: string; colors: string[]; capacities: string[]; esimOnly: boolean };

export async function getCatalog(includeInactive = false): Promise<CatalogItem[]> {
  const models = await db.deviceModel.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ year: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    family: m.family,
    colors: parseJson<string[]>(m.colors, []),
    capacities: parseJson<string[]>(m.capacities, []),
    esimOnly: m.esimOnly,
  }));
}

export type DeviceRow = {
  id: string;
  imei: string | null;
  imei2: string | null;
  serial: string | null;
  modelId: string;
  model: string;
  family: string;
  capacity: string;
  color: string;
  condition: string;
  batteryHealth: number | null;
  grade: string | null;
  status: string;
  origin: string;
  salePrice: number;
  entryDate: string;
  daysInStock: number;
  supplier: string | null;
  /** cliente que comprou ou para quem está reservado */
  customer: string | null;
  /** só para quem pode ver custo */
  cost?: number;
  margin?: number;
};

export async function listDevices(role: string, opts: { includeSold?: boolean } = {}): Promise<DeviceRow[]> {
  const showCost = can(role, "devices.viewCost");
  const devices = await db.device.findMany({
    where: { deletedAt: null, ...(opts.includeSold ? {} : { status: { not: "VENDIDO" } }) },
    include: {
      model: true,
      supplier: true,
      saleItems: { where: { active: true, sale: { status: "CONCLUIDA" } }, select: { sale: { select: { customer: { select: { name: true } } } } }, take: 1 },
    },
    orderBy: { entryDate: "desc" },
  });
  const reservedIds = [...new Set(devices.map((d) => d.reservedCustomerId).filter(Boolean))] as string[];
  const reserved = new Map((reservedIds.length ? await db.customer.findMany({ where: { id: { in: reservedIds } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]));
  return devices.map((d) => {
    const cost = d.acquisitionCost + d.serviceCost;
    return {
      id: d.id,
      imei: d.imei,
      imei2: d.imei2,
      serial: d.serial,
      modelId: d.modelId,
      model: d.model.name,
      family: d.model.family,
      capacity: d.capacity,
      color: d.color,
      condition: d.condition,
      batteryHealth: d.batteryHealth,
      grade: d.grade,
      status: d.status,
      origin: d.origin,
      salePrice: d.salePrice,
      entryDate: d.entryDate.toISOString(),
      daysInStock: d.status === "VENDIDO" ? 0 : daysSince(d.entryDate),
      supplier: d.supplier?.name ?? null,
      customer: d.saleItems[0]?.sale.customer?.name ?? (d.reservedCustomerId ? (reserved.get(d.reservedCustomerId) ?? null) : null),
      ...(showCost ? { cost, margin: d.salePrice - cost } : {}),
    };
  });
}

export async function getDevice(id: string, role: string) {
  const showCost = can(role, "devices.viewCost");
  const d = await db.device.findUnique({
    where: { id },
    include: {
      model: true,
      supplier: true,
      events: { orderBy: { createdAt: "desc" }, include: { user: true } },
      imeiChecks: { orderBy: { createdAt: "desc" }, take: 5, include: { user: true } },
      saleItems: { include: { sale: { include: { customer: true } } }, orderBy: { sale: { createdAt: "desc" } } },
      serviceOrders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      tradeIn: { include: { customer: true, sale: true } },
    },
  });
  if (!d) return null;
  const { acquisitionCost, serviceCost, ...rest } = d;
  return {
    ...rest,
    photos: parseJson<string[]>(d.photos, []),
    showCost,
    acquisitionCost: showCost ? acquisitionCost : null,
    serviceCost: showCost ? serviceCost : null,
    realCost: showCost ? acquisitionCost + serviceCost : null,
    saleItems: d.saleItems.map((i) => ({ ...i, unitCost: showCost ? i.unitCost : 0 })),
  };
}

export async function getSuppliersLite() {
  return db.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
