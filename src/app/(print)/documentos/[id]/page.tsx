import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DocBody } from "@/components/documents/doc-body";
import { requirePage } from "@/lib/session";
import { loadDocument } from "@/features/documents/queries";
import { shareSignature } from "@/features/documents/service";
import { DocToolbar } from "./doc-toolbar";

export const metadata: Metadata = { title: "Documento" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("documents.view");
  const { id } = await params;
  const loaded = await loadDocument(id);
  if (!loaded) notFound();
  const { doc, header, signerName, customerPhone } = loaded;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const shareUrl = `${origin}/d/${doc.id}/${shareSignature(doc.id)}`;

  return (
    <div className="min-h-dvh bg-zinc-100 pb-10 print:bg-white print:pb-0">
      <DocToolbar
        id={doc.id}
        title={doc.title}
        signed={!!doc.signature}
        hasClientSignature={doc.content.includes("{{assinatura_cliente}}")}
        shareUrl={shareUrl}
        customerPhone={customerPhone}
        signerName={signerName}
        storeName={header.nome}
      />
      <div className="px-3 pt-6 print:p-0">
        <DocBody content={doc.content} header={header} signature={doc.signature} signerName={signerName} />
      </div>
    </div>
  );
}
