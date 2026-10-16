import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { StoreForm } from "./store-form";

export const metadata: Metadata = { title: "Dados da loja" };

export default async function StoreSettingsPage() {
  await requirePage("settings.store");
  const s = await db.storeSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Dados da loja" description="Informações usadas em documentos e mensagens." back="/configuracoes" />
      <StoreForm
        defaults={{
          name: s.name,
          legalName: s.legalName ?? "",
          cnpj: s.cnpj ?? "",
          phone: s.phone ?? "",
          whatsapp: s.whatsapp ?? "",
          email: s.email ?? "",
          instagram: s.instagram ?? "",
          website: s.website ?? "",
          logoUrl: s.logoUrl ?? "",
          googleReviewUrl: s.googleReviewUrl ?? "",
          cep: s.cep ?? "",
          street: s.street ?? "",
          number: s.number ?? "",
          complement: s.complement ?? "",
          district: s.district ?? "",
          city: s.city ?? "",
          state: s.state ?? "",
        }}
      />
    </div>
  );
}
