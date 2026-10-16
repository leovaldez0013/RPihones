// Geração automática de documentos chamada pelos fluxos (venda, compra de usado, encomenda, OS).
import type { Tx } from "@/lib/db";
import { generateSaleDocs } from "./service";

export async function generateSaleDocuments(tx: Tx, saleId: string, userId: string): Promise<void> {
  await generateSaleDocs(tx, saleId, userId);
}
