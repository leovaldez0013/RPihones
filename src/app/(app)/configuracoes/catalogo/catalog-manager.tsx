"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormField, NativeSelect } from "@/components/shared/inputs";
import { removeTac, saveModel, saveTac } from "@/features/devices/actions";

type ModelRow = { id: string; name: string; family: string; year: number; colors: string[]; capacities: string[]; active: boolean; devices: number };
type TacRow = { tac: string; modelId: string; model: string; note: string };

export function CatalogManager({ models, tacs }: { models: ModelRow[]; tacs: TacRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ModelRow | "new" | null>(null);

  const modelCols: ColumnDef<ModelRow, unknown>[] = [
    { accessorKey: "name", header: "Modelo", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "year", header: "Ano" },
    { id: "capacities", header: "Capacidades", cell: ({ row }) => row.original.capacities.join(", ") },
    { id: "colors", header: "Cores", cell: ({ row }) => <span className="text-xs">{row.original.colors.join(", ")}</span> },
    { accessorKey: "devices", header: "Aparelhos" },
    {
      accessorKey: "active",
      header: "",
      cell: ({ row }) => !row.original.active && <StatusBadge tone="gray">inativo</StatusBadge>,
    },
  ];

  const tacCols: ColumnDef<TacRow, unknown>[] = [
    { accessorKey: "tac", header: "TAC", cell: ({ row }) => <span className="font-mono">{row.original.tac}</span> },
    { accessorKey: "model", header: "Modelo" },
    { accessorKey: "note", header: "Origem", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.note}</span> },
    {
      id: "rm",
      header: "",
      meta: { className: "w-10" },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remover"
          onClick={async () => {
            const res = await removeTac({ tac: row.original.tac });
            if (!res.ok) return toast.error(res.error);
            toast.success("TAC removido");
            router.refresh();
          }}
        >
          <Trash2 />
        </Button>
      ),
    },
  ];

  return (
    <Tabs defaultValue="models">
      <TabsList className="mb-4">
        <TabsTrigger value="models">Modelos ({models.length})</TabsTrigger>
        <TabsTrigger value="tacs">Tabela TAC ({tacs.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="models">
        <DataTable
          columns={modelCols}
          data={models}
          pageSize={50}
          onRowClick={(r) => setEditing(r)}
          searchPlaceholder="Buscar modelo…"
          toolbar={
            <Button size="lg" className="ml-auto" onClick={() => setEditing("new")}>
              <Plus /> Novo modelo
            </Button>
          }
        />
      </TabsContent>
      <TabsContent value="tacs" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          O TAC são os 8 primeiros dígitos do IMEI e identificam o modelo. O sistema aprende automaticamente a cada aparelho
          cadastrado; você também pode incluir manualmente.
        </p>
        <TacForm models={models} />
        <DataTable columns={tacCols} data={tacs} pageSize={30} searchPlaceholder="Buscar TAC ou modelo…" />
      </TabsContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo modelo" : "Editar modelo"}</DialogTitle>
          </DialogHeader>
          {editing && <ModelForm row={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function ModelForm({ row, onDone }: { row: ModelRow | null; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(row?.name ?? "");
  const [family, setFamily] = useState(row?.family ?? "");
  const [year, setYear] = useState(String(row?.year ?? new Date().getFullYear()));
  const [colors, setColors] = useState(row?.colors.join(", ") ?? "");
  const [capacities, setCapacities] = useState(row?.capacities.join(", ") ?? "");
  const [active, setActive] = useState(row?.active ?? true);
  const [pending, setPending] = useState(false);
  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await saveModel({ id: row?.id, name, family: family || name, year, colors: split(colors), capacities: split(capacities), active });
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Modelo salvo");
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <FormField label="Nome" className="sm:col-span-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="iPhone 18 Pro" autoFocus />
      </FormField>
      <FormField label="Linha/família">
        <Input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="iPhone 18" />
      </FormField>
      <FormField label="Ano">
        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
      </FormField>
      <FormField label="Capacidades (separadas por vírgula)" className="sm:col-span-2">
        <Input value={capacities} onChange={(e) => setCapacities(e.target.value)} placeholder="256GB, 512GB, 1TB" />
      </FormField>
      <FormField label="Cores (separadas por vírgula)" className="sm:col-span-2">
        <Input value={colors} onChange={(e) => setColors(e.target.value)} />
      </FormField>
      <label className="flex items-center gap-3 text-sm sm:col-span-2">
        <Switch checked={active} onCheckedChange={setActive} /> Ativo (aparece nos cadastros)
      </label>
      <DialogFooter className="sm:col-span-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

function TacForm({ models }: { models: ModelRow[] }) {
  const router = useRouter();
  const [tac, setTac] = useState("");
  const [modelId, setModelId] = useState("");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await saveTac({ tac, modelId, note: "Cadastro manual" });
        if (!res.ok) return toast.error(res.error);
        toast.success("TAC salvo");
        setTac("");
        router.refresh();
      }}
    >
      <Input value={tac} onChange={(e) => setTac(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="TAC (8 dígitos)" className="font-mono sm:w-44" />
      <NativeSelect value={modelId} onChange={(e) => setModelId(e.target.value)} className="h-8 sm:w-64">
        <option value="">Modelo…</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" disabled={tac.length !== 8 || !modelId}>
        <Plus /> Adicionar TAC
      </Button>
    </form>
  );
}
