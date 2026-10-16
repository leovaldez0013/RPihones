"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/features/uploads/actions";
import { cn } from "@/lib/utils";

/** Upload de fotos com miniaturas. No celular abre a câmera. */
export function PhotoUpload({
  value,
  onChange,
  folder = "aparelhos",
  max = 8,
  className,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  folder?: string;
  max?: number;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    fd.set("folder", folder);
    Array.from(files)
      .slice(0, max - value.length)
      .forEach((f) => fd.append("files", f));
    setLoading(true);
    const res = await uploadFiles(fd);
    setLoading(false);
    if (input.current) input.current.value = "";
    if (!res.ok) return toast.error(res.error);
    onChange([...value, ...res.data]);
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {value.map((url) => (
        <div key={url} className="group relative size-20 overflow-hidden rounded-xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full object-cover" />
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
          {loading ? "Enviando" : "Foto"}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
