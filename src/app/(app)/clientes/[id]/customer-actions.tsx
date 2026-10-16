"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CustomerForm } from "@/components/forms/customer-form";
import type { CustomerInput } from "@/features/customers/schemas";
import { deleteCustomer } from "@/features/customers/actions";

export function CustomerActions({ customer, canEdit, canSell }: { customer: CustomerInput & { id: string }; canEdit: boolean; canSell: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  return (
    <>
      {canSell && (
        <Button asChild size="lg">
          <Link href={`/vendas/nova?cliente=${customer.id}`}>
            <ShoppingCart /> Nova venda
          </Link>
        </Button>
      )}
      {canEdit && (
        <>
          <Button variant="outline" size="lg" onClick={() => setEditing(true)}>
            <Pencil /> Editar
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="destructive" size="icon-lg" aria-label="Excluir">
                <Trash2 />
              </Button>
            }
            title={`Excluir ${customer.name}?`}
            description="O cadastro some das listas, mas vendas e documentos continuam no histórico."
            onConfirm={async () => {
              const res = await deleteCustomer({ id: customer.id });
              if (!res.ok) return toast.error(res.error);
              toast.success("Cliente excluído");
              router.push("/clientes");
            }}
          />
          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar cliente</DialogTitle>
              </DialogHeader>
              <div className="max-h-[75vh] overflow-y-auto px-1">
                <CustomerForm
                  defaults={customer}
                  onCancel={() => setEditing(false)}
                  onSaved={() => {
                    setEditing(false);
                    router.refresh();
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
