import { parseMarkdown, type Block, type Inline } from "@/domain/template";
import { cn } from "@/lib/utils";

export type DocHeader = { nome: string; cnpj?: string; endereco?: string; telefone?: string; whatsapp?: string; instagram?: string; email?: string; logo?: string };

function Inl({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? <strong key={i}>{p.text}</strong> : p.italic ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

function BlockView({ b, signature, signerName, storeName }: { b: Block; signature?: string | null; signerName: string; storeName: string }) {
  switch (b.type) {
    case "h1":
      return <h1 className="mt-2 mb-4 text-center text-xl font-bold tracking-tight"><Inl parts={b.inline} /></h1>;
    case "h2":
      return <h2 className="mt-5 mb-2 text-base font-semibold"><Inl parts={b.inline} /></h2>;
    case "h3":
      return <h3 className="mt-4 mb-1 text-sm font-semibold"><Inl parts={b.inline} /></h3>;
    case "p":
      return (
        <p className={cn("mb-3 leading-relaxed whitespace-pre-line", b.align === "center" && "text-center", b.align === "right" && "text-right")}>
          <Inl parts={b.inline} />
        </p>
      );
    case "ul":
      return (
        <ul className="mb-3 ml-5 list-disc space-y-1">
          {b.items.map((it, i) => (
            <li key={i}>
              <Inl parts={it} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table className="mb-4 w-full border-collapse text-[0.92em]">
          <thead>
            <tr>
              {b.header.map((h, i) => (
                <th key={i} className="border border-zinc-300 bg-zinc-100 px-2 py-1.5 text-left font-semibold">
                  <Inl parts={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="border border-zinc-300 px-2 py-1.5 align-top">
                    <Inl parts={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "hr":
      return <hr className="my-4 border-zinc-300" />;
    case "signature":
      return (
        <div className="mx-auto mt-10 mb-2 flex w-72 flex-col items-center break-inside-avoid">
          {b.who === "cliente" && signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signature} alt="Assinatura do cliente" className="-mb-2 h-16 object-contain" />
          ) : (
            <div className="h-14" />
          )}
          <div className="w-full border-t border-zinc-800" />
          <p className="mt-1 text-center text-xs">{b.who === "cliente" ? signerName : storeName}</p>
          <p className="text-center text-[10px] text-zinc-500">{b.who === "cliente" ? "Assinatura do cliente" : "Pela loja"}</p>
        </div>
      );
  }
}

/** Documento no estilo folha A4 — usado na tela, na impressão e no link público. */
export function DocBody({
  content,
  header,
  signature,
  signerName,
  className,
}: {
  content: string;
  header: DocHeader;
  signature?: string | null;
  signerName: string;
  className?: string;
}) {
  const blocks = parseMarkdown(content);
  return (
    <article className={cn("doc-paper mx-auto w-full max-w-[210mm] bg-white px-8 py-8 text-[13px] text-zinc-900 shadow-soft sm:px-12 print:max-w-none print:p-0 print:shadow-none", className)}>
      <header className="mb-6 flex items-center gap-4 border-b border-zinc-200 pb-4">
        {header.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={header.logo} alt="" className="size-14 rounded-xl object-contain" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-xl bg-zinc-900 text-lg font-bold text-white">{header.nome.slice(0, 2).toUpperCase()}</div>
        )}
        <div className="min-w-0 text-[11px] leading-snug text-zinc-600">
          <p className="text-base font-semibold text-zinc-900">{header.nome}</p>
          {header.cnpj && <p>CNPJ {header.cnpj}</p>}
          {header.endereco && <p>{header.endereco}</p>}
          <p>{[header.telefone, header.whatsapp && header.whatsapp !== header.telefone ? `WhatsApp ${header.whatsapp}` : null, header.instagram, header.email].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} signature={signature} signerName={signerName} storeName={header.nome} />
      ))}
    </article>
  );
}
