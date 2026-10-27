/** Logo padrão da loja (public/brand/logo.jpg); "URL do logo" em Configurações → Loja substitui. */
export const DEFAULT_LOGO = "/brand/logo.jpg";

/** Só aceita endereço de imagem (arquivo do site, data URL, Vercel Blob ou link terminado em .png/.jpg/…);
 * um link de página (ex.: perfil do Instagram) cai no logo padrão em vez de virar imagem quebrada. */
export function isImageUrl(url: string) {
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("/")) return /\.(png|jpe?g|webp|gif|svg)$/i.test(url.split("?")[0]);
  try {
    const u = new URL(url);
    return u.hostname.endsWith(".blob.vercel-storage.com") || /\.(png|jpe?g|webp|gif|svg)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function storeLogo(logoUrl?: string | null) {
  const url = logoUrl?.trim();
  return url && isImageUrl(url) ? url : DEFAULT_LOGO;
}
