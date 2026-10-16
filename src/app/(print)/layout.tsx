import { requirePage } from "@/lib/session";

/** Layout limpo para impressão (etiquetas, documentos). */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requirePage();
  return <div className="min-h-dvh bg-white text-black">{children}</div>;
}
