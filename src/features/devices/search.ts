import type { DeviceRow } from "./queries";

/** Texto pesquisável de um aparelho no estoque: modelo, cor, capacidade, IMEI, série, fornecedor e cliente. */
export function deviceSearchText(r: Pick<DeviceRow, "imei" | "imei2" | "serial" | "model" | "capacity" | "color" | "supplier" | "customer">) {
  return `${r.imei ?? "sem imei"} ${r.imei2 ?? ""} ${r.serial ?? ""} ${r.model} ${r.capacity} ${r.color} ${r.supplier ?? ""} ${r.customer ?? ""}`;
}
