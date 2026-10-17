"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Repeat, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, MoneyInput, NativeSelect } from "@/components/shared/inputs";
import { ImeiField } from "@/components/shared/imei-field";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { DeviceChecklist, emptyChecklist } from "@/components/forms/device-checklist";
import { GRADES } from "@/domain/constants";
import { formatBRL } from "@/domain/money";
import { validateImei } from "@/domain/imei";
import type { CatalogItem } from "@/features/devices/queries";
import { evaluateTradeInAction } from "@/features/sales/actions";

export type TradeInDraft = {
  key: string;
  imei: string;
  modelId: string;
  capacity: string;
  color: string;
  batteryHealth: number | null;
  grade: string;
  checklist: Record<string, boolean>;
  photos: string[];
  notes: string;
  suggestedValue: number;
  finalValue: number;
};

type Evaluation = Extract<Awaited<ReturnType<typeof evaluateTradeInAction>>, { ok: true }>["data"];

export function TradeInDialog({
  open,
  onOpenChange,
  catalog,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  catalog: CatalogItem[];
  initial?: TradeInDraft | null;
  onSave: (t: TradeInDraft) => void;
}) {
  const [imei, setImei] = useState("");
  const [modelId, setModelId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [color, setColor] = useState("");
  const [battery, setBattery] = useState("");
  const [grade, setGrade] = useState("A");
  const [checklist, setChecklist] = useState(emptyChecklist());
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [finalValue, setFinalValue] = useState(0);
  const [touchedValue, setTouchedValue] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setImei(initial?.imei ?? "");
    setModelId(initial?.modelId ?? "");
    setCapacity(initial?.capacity ?? "");
    setColor(initial?.color ?? "");
    setBattery(initial?.batteryHealth != null ? String(initial.batteryHealth) : "");
    setGrade(initial?.grade || "A");
    setChecklist(initial?.checklist ?? emptyChecklist());
    setPhotos(initial?.photos ?? []);
    setNotes(initial?.notes ?? "");
    setFinalValue(initial?.finalValue ?? 0);
    setTouchedValue(!!initial);
    setEvaluation(null);
  }, [open, initial]);

  const model = catalog.find((m) => m.id === modelId);

  // recalcula a sugestão sempre que algo relevante muda
  useEffect(() => {
    if (!modelId || !capacity) {
      setEvaluation(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await evaluateTradeInAction({
        modelId,
        capacity,
        batteryHealth: battery ? Math.min(100, Math.max(0, Number(battery))) : null,
        grade,
        checklist,
      });
      if (cancel) return;
      setLoading(false);
      if (res.ok) {
        setEvaluation(res.data);
        if (!touchedValue) setFinalValue(res.data.suggested);
      }
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, capacity, battery, grade, checklist]);

  function save() {
    const v = validateImei(imei);
    if (!v.formatOk || !v.luhnOk) return toast.error(`IMEI do aparelho de troca: ${v.message}`);
    if (!modelId || !capacity || !color) return toast.error("Informe modelo, capacidade e cor.");
    if (evaluation?.blocked) return toast.error(`Troca recusada: ${evaluation.blockReason}`);
    if (finalValue <= 0) return toast.error("Informe o valor da troca.");
    onSave({
      key: initial?.key ?? `t${Date.now()}`,
      imei: v.imei,
      modelId,
      capacity,
      color,
      batteryHealth: battery ? Number(battery) : null,
      grade,
      checklist,
      photos,
      notes,
      suggestedValue: evaluation?.suggested ?? 0,
      finalValue,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-5" /> Receber aparelho na troca
          </DialogTitle>
          <DialogDescription>Avalie o aparelho do cliente. O valor abate do total e o aparelho entra no estoque ao concluir a venda.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto px-1 sm:grid-cols-2">
          <FormField label="IMEI" required className="sm:col-span-2">
            <ImeiField checkable value={imei} onChange={setImei} onLookup={(r) => r.tacModel && !modelId && setModelId(r.tacModel.id)} />
          </FormField>
          <FormField label="Modelo" required>
            <NativeSelect value={modelId} onChange={(e) => { setModelId(e.target.value); setCapacity(""); setColor(""); }} className="h-9">
              <option value="">Selecione…</option>
              {catalog.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Capacidade" required>
              <NativeSelect value={capacity} onChange={(e) => setCapacity(e.target.value)} className="h-9">
                <option value="">—</option>
                {model?.capacities.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </FormField>
            <FormField label="Cor" required>
              <NativeSelect value={color} onChange={(e) => setColor(e.target.value)} className="h-9">
                <option value="">—</option>
                {model?.colors.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="Saúde da bateria (%)">
            <Input type="number" min={0} max={100} value={battery} onChange={(e) => setBattery(e.target.value)} placeholder="Ajustes > Bateria" />
          </FormField>
          <FormField label="Grade estético">
            <NativeSelect value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9">
              {GRADES.list.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Checklist de funcionamento" className="sm:col-span-2">
            <DeviceChecklist value={checklist} onChange={setChecklist} />
          </FormField>
          <FormField label="Fotos" className="sm:col-span-2">
            <PhotoUpload value={photos} onChange={setPhotos} folder="trocas" />
          </FormField>
          <FormField label="Observações" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Acompanha caixa? Riscos? Peças trocadas?" />
          </FormField>
        </div>

        <div className="rounded-2xl border bg-muted/40 p-4">
          {evaluation?.blocked ? (
            <p className="flex items-center gap-2 font-medium text-red-600">
              <AlertTriangle className="size-5" /> Troca recusada: {evaluation.blockReason}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
              <div className="text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="size-4 text-primary" /> Valor sugerido{" "}
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <span className="text-lg tabular">{formatBRL(evaluation?.suggested ?? 0)}</span>}
                </p>
                {evaluation && !evaluation.hasTable && modelId && capacity && (
                  <p className="text-xs text-amber-600">Sem valor na tabela de avaliação para este modelo/capacidade — informe manualmente.</p>
                )}
                {evaluation && evaluation.hasTable && (
                  <p className="text-xs text-muted-foreground">
                    Base {formatBRL(evaluation.base)}
                    {evaluation.adjustments.map((a) => ` · ${a.label} ${a.pct > 0 ? "+" : ""}${a.pct}%`).join("")}
                  </p>
                )}
              </div>
              <FormField label="Valor da troca (editável)">
                <MoneyInput
                  value={finalValue}
                  onChange={(v) => {
                    setTouchedValue(true);
                    setFinalValue(v);
                  }}
                  className="h-10 text-base font-semibold"
                />
              </FormField>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!!evaluation?.blocked}>
            Usar na venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
