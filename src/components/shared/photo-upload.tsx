"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/features/uploads/actions";
import { checkUpload, uploadExt, uploadFolder } from "@/lib/upload-rules";
import { cn } from "@/lib/utils";

/** Upload de fotos com miniaturas. No celular abre a câmera. */
export function PhotoUpload({
  value,
  onChange,
  folder = "aparelhos",
  max = 8,
  className,
  accept = "image/*",
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  folder?: string;
  max?: number;
  className?: string;
  accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, max - value.length);
    setLoading(true);
    try {
      if (process.env.NEXT_PUBLIC_BLOB_UPLOAD === "1") {
        // produção: direto do navegador para o Vercel Blob (sem o limite de 4,5 MB das funções)
        const { upload } = await import("@vercel/blob/client");
        const dir = uploadFolder(folder);
        const urls: string[] = [];
        for (const f of list) {
          const problem = checkUpload(f);
          if (problem) throw new Error(problem);
          const blob = await upload(`${dir}/${Date.now()}.${uploadExt(f.type)}`, f, { access: "public", handleUploadUrl: "/api/upload", clientPayload: dir, contentType: f.type });
          urls.push(blob.url);
        }
        onChange([...value, ...urls]);
      } else {
        const fd = new FormData();
        fd.set("folder", folder);
        list.forEach((f) => fd.append("files", f));
        const res = await uploadFiles(fd);
        if (!res.ok) throw new Error(res.error);
        onChange([...value, ...res.data]);
      }
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar o arquivo.");
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {value.map((url) => (
        <div key={url} className="group relative size-20 overflow-hidden rounded-xl border bg-muted">
          {url.endsWith(".pdf") ? (
            <a href={url} target="_blank" rel="noreferrer" className="flex size-full items-center justify-center text-xs font-semibold text-muted-foreground">PDF</a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => onChange(value.filter((u) => u !== url))}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
            aria-label="Remover foto"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={loading}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          {loading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          {loading ? "Enviando" : accept === "image/*" ? "Foto" : "Anexo"}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        capture={accept === "image/*" ? "environment" : undefined}
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
