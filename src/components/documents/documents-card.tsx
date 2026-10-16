import Link from "next/link";
import { FileText, PenLine, Download, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

type Doc = { id: string; title: string; number: number; createdAt: Date; signature: string | null; content: string };

/** Lista de documentos emitidos (venda, OS, encomenda) com atalhos de abrir, PDF e assinatura. */
export function DocumentsCard({ docs, title = "Documentos" }: { docs: Doc[]; title?: string }) {
  if (!docs.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {docs.map((d) => {
          const needsSignature = d.content.includes("{{assinatura_cliente}}");
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/documentos/${d.id}`} target="_blank" className="block truncate text-sm font-medium hover:underline">
                  {d.title}
                </Link>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  nº {d.number} · {formatDateTime(d.createdAt)}
                  {needsSignature &&
                    (d.signature ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-600">
                        · <CheckCircle2 className="size-3" /> assinado
                      </span>
                    ) : (
                      <span className="text-amber-600">· aguardando assinatura</span>
                    ))}
                </p>
              </div>
              <Button asChild variant="ghost" size="icon" aria-label="Baixar PDF">
                <a href={`/api/documentos/${d.id}/pdf?download=1`}>
                  <Download />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/documentos/${d.id}`} target="_blank">
                  {needsSignature && !d.signature ? <PenLine /> : <FileText />} Abrir
                </Link>
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
