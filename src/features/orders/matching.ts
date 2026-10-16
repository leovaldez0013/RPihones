// Ganchos chamados quando um aparelho fica disponível no estoque.
import type { Tx } from "@/lib/db";
import { notifyMatchingOrders } from "./service";

export async function onDeviceAvailable(tx: Tx, deviceId: string): Promise<void> {
  await notifyMatchingOrders(tx, deviceId);
}
