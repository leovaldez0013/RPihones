"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Leitura de código de barras/QR pela câmera do celular.
 * Leitores USB/Bluetooth funcionam como teclado e não precisam deste componente.
 */
export function BarcodeScannerButton({
  onResult,
  label = "Escanear",
  size = "lg",
  variant = "outline",
}: {
  onResult: (text: string) => void;
  label?: string;
  size?: "lg" | "default" | "icon-lg";
  variant?: "outline" | "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} aria-label={label}>
        <ScanLine />
        {size !== "icon-lg" && label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aponte a câmera para o código</DialogTitle>
            <DialogDescription>IMEI (caixa ou etiqueta), código de barras do acessório ou QR code da etiqueta.</DialogDescription>
          </DialogHeader>
          {open && (
            <ScannerView
              onResult={(t) => {
                setOpen(false);
                onResult(t);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScannerView({ onResult }: { onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (!video.current || cancelled) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current,
          (result) => {
            if (result) {
              controls.stop();
              onResult(result.getText());
            }
          },
        );
        stop = () => controls.stop();
        setStarting(false);
      } catch {
        setError("Não foi possível acessar a câmera. Verifique a permissão do navegador (é preciso HTTPS no celular).");
        setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onResult]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
      <video ref={video} className="size-full object-cover" muted playsInline />
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}
      {!error && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_12px_red]" />}
      {error && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{error}</p>}
    </div>
  );
}

/** IMEI vindo de QR/código pode ter prefixos ("IMEI: ..."). Extrai os 15 dígitos. */
export function extractImei(text: string): string {
  const m = text.match(/\d{15}/);
  return m ? m[0] : text.replace(/\D/g, "").slice(0, 15);
}
