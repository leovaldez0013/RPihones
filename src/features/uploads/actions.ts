"use server";

import { getUser } from "@/lib/session";
import { saveUpload } from "@/lib/storage";
import type { ActionResult } from "@/lib/safe-action";

/** Recebe FormData com campo "files" (múltiplos) e "folder". */
export async function uploadFiles(formData: FormData): Promise<ActionResult<string[]>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  const folder = String(formData.get("folder") ?? "geral");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Nenhum arquivo enviado." };
  try {
    const urls = await Promise.all(files.map((f) => saveUpload(f, folder)));
    return { ok: true, data: urls };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
