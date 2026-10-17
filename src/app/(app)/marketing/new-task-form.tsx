"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, NativeSelect } from "@/components/shared/inputs";
import { createTaskAction } from "@/features/marketing/actions";

export function NewTaskForm({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova tarefa</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await createTaskAction({ title, customerId: customerId || null, dueDate });
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success("Tarefa criada");
            setTitle("");
            setCustomerId("");
            setDueDate("");
            router.refresh();
          }}
        >
          <FormField label="O que fazer">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: ligar para oferecer o iPhone 17" />
          </FormField>
          <FormField label="Cliente (opcional)">
            <NativeSelect value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-9">
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Para quando">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <Button type="submit" disabled={busy || title.trim().length < 3}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Criar tarefa
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
