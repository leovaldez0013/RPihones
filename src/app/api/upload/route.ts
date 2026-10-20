// Upload direto do navegador para o Vercel Blob (fotos de celular passam do limite de 4,5 MB das
// funções da Vercel). Esta rota só emite o token de envio, e só para usuário logado.
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getUser } from "@/lib/session";
import { UPLOAD_MAX_BYTES, UPLOAD_TYPES, uploadFolder } from "@/lib/upload-rules";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getUser();
        if (!user) throw new Error("Sessão expirada.");
        const folder = uploadFolder(clientPayload);
        if (!pathname.startsWith(`${folder}/`)) throw new Error("Caminho de upload inválido.");
        return { allowedContentTypes: UPLOAD_TYPES, maximumSizeInBytes: UPLOAD_MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
