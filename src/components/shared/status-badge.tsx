import { TONE_CLASSES, type Tone } from "@/domain/constants";
import { cn } from "@/lib/utils";

type OptionSet = { label: (v: string | null | undefined) => string; tone: (v: string | null | undefined) => Tone };

export function StatusBadge({
  value,
  options,
  tone,
  children,
  className,
}: {
  value?: string | null;
  options?: OptionSet;
  tone?: Tone;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = tone ?? options?.tone(value) ?? "gray";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[t],
        className,
      )}
    >
      {children ?? options?.label(value) ?? value}
    </span>
  );
}
