import { db } from "@/lib/db";
import { makeImei } from "@/domain/imei";
import type { DeviceData } from "@/features/devices/schemas";

let counter = 0;

export async function testUser(role = "ADMIN") {
  counter++;
  return db.user.create({
    data: { name: `Teste ${role} ${counter}`, email: `teste${counter}-${Date.now()}@x.com`, passwordHash: "x", role, commissionPct: 2, discountLimitPct: 5 },
  });
}

export async function testModel(name = `iPhone Teste ${++counter}`) {
  return db.deviceModel.create({
    data: { name, family: "iPhone Teste", year: 2024, colors: JSON.stringify(["Preto"]), capacities: JSON.stringify(["128GB", "256GB"]) },
  });
}

let serial = 1000;
export function nextImei(tac = "35999999") {
  return makeImei(tac, serial++);
}

export function deviceData(modelId: string, over: Partial<DeviceData> = {}): DeviceData {
  return {
    imei: nextImei(),
    imei2: null,
    serial: null,
    modelId,
    capacity: "128GB",
    color: "Preto",
    condition: "SEMINOVO",
    batteryHealth: 90,
    grade: "A",
    notes: null,
    photos: [],
    supplierId: null,
    acquisitionCost: 300000,
    salePrice: 400000,
    entryDate: new Date(),
    appleWarrantyUntil: null,
    status: "DISPONIVEL",
    ...over,
  };
}
