"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { MaskedInput } from "./inputs";
import { BarcodeScannerButton, extractImei } from "./barcode-scanner";
import { lookupImei } from "@/features/devices/actions";
import { DEVICE_STATUS } from "@/domain/constants";

export type ImeiLookup = {
  formatOk: boolean;
  luhnOk: boolean;
  message: string;
  tacModel: { id: string; name: string } | null;
  existing: { id: string; name: string; status: string; deleted: boolean } | null;
};

/** Campo de IMEI com validação ao vivo (Luhn), sugestão de modelo pelo TAC e aviso de duplicidade. */
export function ImeiField({
  value,
  onChange,
  onLookup,
  ignoreId,
  id = "imei",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onLookup?: (r: ImeiLookup) => void;
  ignoreId?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  const [result, setResult] = useState<ImeiLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const digits = value.replace(/\D/g, "");

  useEffect(() => {
    if (digits.length !== 15) {
      setResult(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    lookupImei({ imei: digits }).then((res) => {
      if (cancel) return;
      setLoading(false);
      if (res.ok) {
        setResult(res.data);
        onLookup?.(res.data);
      }
    });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const duplicate = result?.existing && result.existing.id !== ignoreId ? result.existing : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <MaskedInput
          id={id}
          mask="imei"
          value={value}
          onChange={onChange}
          placeholder="15 dígitos — *#06# no aparelho"
          className="font-mono tracking-wider"
          autoFocus={autoFocus}
          autoComplete="off"
        />
        <BarcodeScannerButton size="icon-lg" onResult={(t) => onChange(extractImei(t))} label="Escanear IMEI" />
      </div>
      {loading && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Validando…
        </p>
      )}
      {!loading && result && (
        <div className="flex flex-col gap-1 text-xs">
          <p className={`flex items-center gap-1 ${result.luhnOk ? "text-emerald-600" : "text-destructive"}`}>
            {result.luhnOk ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
            {result.message}
          </p>
          {result.tacModel && (
            <p className="flex items-center gap-1 text-muted-foreground">
              <Info className="size-3.5" /> TAC reconhecido: <strong>{result.tacModel.name}</strong>
            </p>
          )}
          {duplicate && (
            <p className="flex items-center gap-1 font-medium text-destructive">
              <AlertCircle className="size-3.5" /> Já cadastrado: {duplicate.name} ({DEVICE_STATUS.label(duplicate.status)}
              {duplicate.deleted ? ", excluído" : ""}) —{" "}
              <Link href={`/estoque/aparelhos/${duplicate.id}`} className="underline">
                abrir
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
