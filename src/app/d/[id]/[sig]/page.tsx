import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { DocBody } from "@/components/documents/doc-body";
import { loadDocument } from "@/features/documents/queries";
import { verifyShare } from "@/features/documents/service";

export const metadata: Metadata = { title: "Documento", robots: { index: false, follow: false } };

/** Link público (assinado) enviado ao cliente pelo WhatsApp — somente leitura. */
export default async function SharedDocumentPage({ params }: { params: Promise<{ id: string; sig: string }> }) {
  const { id, sig } = await params;
  if (!verifyShare(id, sig)) notFound();
  const loaded = await loadDocument(id);
  if (!loaded) notFound();
  return (
    <div className="min-h-dvh bg-zinc-100 py-6 text-zinc-900">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-3">
        <a
          href={`/api/documentos/${id}/pdf?sig=${sig}&download=1`}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          <Download className="size-4" /> Baixar PDF
        </a>
      </div>
      <div className="px-3">
        <DocBody content={loaded.doc.content} header={loaded.header} signature={loaded.doc.signature} signerName={loaded.signerName} />
      </div>
    </div>
  );
}
