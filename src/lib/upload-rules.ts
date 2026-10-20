// Regras de upload compartilhadas entre o navegador, a rota de upload direto e o armazenamento local.

export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export function uploadFolder(folder: string | null | undefined) {
  return (folder ?? "geral").replace(/[^a-z0-9-]/gi, "") || "geral";
}

export function uploadExt(type: string) {
  return type === "application/pdf" ? "pdf" : (type.split("/")[1] ?? "bin").replace("jpeg", "jpg");
}

export function checkUpload(file: { type: string; size: number }) {
  if (!UPLOAD_TYPES.includes(file.type)) return `Tipo de arquivo não permitido: ${file.type || "desconhecido"}`;
  if (file.size > UPLOAD_MAX_BYTES) return "Arquivo maior que 8 MB";
  return null;
}
