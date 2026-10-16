"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { maskCEP, maskCPF, maskCpfCnpj, maskIMEI, maskPhone, maskMoneyFromCents } from "@/lib/masks";

/** Rótulo + controle + erro. */
export function FormField({
  label,
  error,
  hint,
  htmlFor,
  className,
  required,
  children,
}: {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-[13px] text-muted-foreground">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

type MaskKind = "cpf" | "cpfCnpj" | "phone" | "cep" | "imei";
const MASKS: Record<MaskKind, (v: string) => string> = {
  cpf: maskCPF,
  cpfCnpj: maskCpfCnpj,
  phone: maskPhone,
  cep: maskCEP,
  imei: maskIMEI,
};

export const MaskedInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & {
    mask: MaskKind;
    value?: string | null;
    onChange?: (v: string) => void;
  }
>(function MaskedInput({ mask, value, onChange, ...props }, ref) {
  return (
    <Input
      ref={ref}
      inputMode={mask === "imei" || mask === "cep" || mask === "cpf" ? "numeric" : mask === "phone" ? "tel" : undefined}
      {...props}
      value={value ? MASKS[mask](value) : ""}
      onChange={(e) => onChange?.(MASKS[mask](e.target.value))}
    />
  );
});

/** Input de moeda em centavos — digita como caixa registradora. */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & {
    value?: number | null;
    onChange?: (cents: number) => void;
  }
>(function MoneyInput({ value, onChange, className, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        ref={ref}
        inputMode="numeric"
        {...props}
        className={cn("pl-9 text-right tabular", className)}
        value={maskMoneyFromCents(value ?? 0)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
          onChange?.(Number(digits || "0"));
        }}
        onFocus={(e) => {
          const el = e.target;
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
        }}
      />
    </div>
  );
});

/** Select nativo estilizado (rápido e ótimo no celular). */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(function NativeSelect(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
