/** Logo padrão da loja (public/brand/logo.jpg); "URL do logo" em Configurações → Loja substitui. */
export const DEFAULT_LOGO = "/brand/logo.jpg";

export function storeLogo(logoUrl?: string | null) {
  return logoUrl?.trim() || DEFAULT_LOGO;
}
