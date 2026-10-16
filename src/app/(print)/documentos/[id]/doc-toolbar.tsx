"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { ArrowLeft, Download, Eraser, Loader2, MessageCircle, PenLine, Printer, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { whatsappLink } from "@/lib/format";
import { saveSignatureAction } from "@/features/documents/actions";

export function DocToolbar({
  id,
  title,
  signed,
  hasClientSignature,
  shareUrl,
  customerPhone,
  signerName,
  storeName,
}: {
  id: string;
  title: string;
  signed: boolean;
  hasClientSignature: boolean;
  shareUrl: string;
  customerPhone: string | null;
  signerName: string;
  storeName: string;
}) {
  const router = useRouter();
  const [signing, setSigning] = useState(false);
  const message = `Olá, ${signerName.split(" ")[0]}! Segue o documento "${title}" da ${storeName}:\n${shareUrl}`;

  return (
    <div className="no-print sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-3 py-2.5">
        <Button variant="ghost" size="lg" onClick={() => (history.length > 1 ? router.back() : router.push("/vendas"))}>
          <ArrowLeft /> Voltar
        </Button>
        <p className="mr-auto truncate text-sm font-medium text-zinc-700">{title}</p>
        {hasClientSignature && !signed && (
          <Button variant="outline" size="lg" onClick={() => setSigning(true)}>
            <PenLine /> Assinar na tela
          </Button>
        )}
        <Button variant="outline" size="lg" asChild>
          <a href={`/api/documentos/${id}/pdf?download=1`}>
            <Download /> PDF
          </a>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            navigator.clipboard.writeText(shareUrl);
            toast.success("Link copiado");
          }}
          aria-label="Copiar link"
        >
          <Copy />
        </Button>
        <Button asChild size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700">
          <a href={whatsappLink(customerPhone, message)} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
        </Button>
        <Button size="lg" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
      </div>
      <SignatureDialog
        open={signing}
        onOpenChange={setSigning}
        signerName={signerName}
        onSave={async (dataUrl) => {
          const res = await saveSignatureAction({ id, signature: dataUrl });
          if (!res.ok) return toast.error(res.error);
          toast.success("Assinatura registrada no documento");
          setSigning(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function SignatureDialog({ open, onOpenChange, signerName, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; signerName: string; onSave: (dataUrl: string) => Promise<unknown> }) {
  const ref = useRef<SignatureCanvas>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assinatura do cliente</DialogTitle>
          <DialogDescription>{signerName}, assine com o dedo ou a caneta no quadro abaixo.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl border-2 border-dashed bg-white">
          <SignatureCanvas ref={ref} penColor="#111" canvasProps={{ className: "h-56 w-full touch-none" }} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => ref.current?.clear()}>
            <Eraser /> Limpar
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!ref.current || ref.current.isEmpty()) return toast.error("Faça a assinatura no quadro.");
              setSaving(true);
              await onSave(trimmedPng(ref.current.getCanvas()));
              setSaving(false);
            }}
          >
            {saving && <Loader2 className="animate-spin" />} Confirmar assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Recorta as bordas transparentes da assinatura (o getTrimmedCanvas da lib falha no build ESM). */
function trimmedPng(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return canvas.toDataURL("image/png");
  const pad = 6;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  const w = Math.min(width, right + pad) - left;
  const h = Math.min(height, bottom + pad) - top;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out.toDataURL("image/png");
}
