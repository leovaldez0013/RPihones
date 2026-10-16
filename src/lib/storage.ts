import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Salva um arquivo enviado e devolve a URL pública.
 * Desenvolvimento: grava em public/uploads. Em produção (Vercel), troque esta função
 * por Vercel Blob/S3 — o resto do sistema só usa a URL retornada.
 */
export async function saveUpload(file: File, folder = "geral"): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new Error(`Tipo de arquivo não permitido: ${file.type || "desconhecido"}`);
  if (file.size > MAX_BYTES) throw new Error("Arquivo maior que 8 MB");
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "");
  const dir = path.join(process.cwd(), "public", "uploads", safeFolder);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${safeFolder}/${name}`;
}
