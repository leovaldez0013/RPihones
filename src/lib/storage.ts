import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { checkUpload, uploadExt, uploadFolder } from "./upload-rules";

/** Arquivos vão para o Vercel Blob quando o token existe (produção); senão, para public/uploads (desenvolvimento). */
export function blobEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Salva um arquivo enviado e devolve a URL pública. O resto do sistema só usa a URL. */
export async function saveUpload(file: File, folder = "geral"): Promise<string> {
  const problem = checkUpload(file);
  if (problem) throw new Error(problem);
  const dir = uploadFolder(folder);
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${uploadExt(file.type)}`;

  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${dir}/${name}`, file, { access: "public", contentType: file.type });
    return blob.url;
  }

  const abs = path.join(process.cwd(), "public", "uploads", dir);
  await mkdir(abs, { recursive: true });
  await writeFile(path.join(abs, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${dir}/${name}`;
}
