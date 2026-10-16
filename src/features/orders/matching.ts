// Ganchos chamados quando um aparelho fica disponível no estoque.
// A busca de encomendas compatíveis é implementada na fase de Encomendas.
import type { Tx } from "@/lib/db";

export async function onDeviceAvailable(_tx: Tx, _deviceId: string): Promise<void> {
  void _tx;
  void _deviceId;
}
