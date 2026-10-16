import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadDocument } from "@/features/documents/queries";
import { verifyShare } from "@/features/documents/service";
import { renderDocumentPdf } from "@/features/documents/pdf";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const sig = url.searchParams.get("sig");
  const user = await getUser();
  // acesso: usuário logado com permissão, ou link público assinado
  if (!(user && can(user.role, "documents.view")) && !(sig && verifyShare(id, sig))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const loaded = await loadDocument(id);
  if (!loaded) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  const buffer = await renderDocumentPdf(loaded.doc, loaded.header, loaded.signerName);
  const filename = `${loaded.doc.title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w#-]+/g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
