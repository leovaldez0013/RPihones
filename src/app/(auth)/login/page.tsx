import type { Metadata } from "next";
import { storeLogo } from "@/lib/brand";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  if (await getUser()) redirect("/dashboard");
  const store = await db.storeSettings.findUnique({ where: { id: "default" } }).catch(() => null);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo pode ser link externo configurado na loja */}
          <img src={storeLogo(store?.logoUrl)} alt={store?.name ?? "Logo"} className="size-24 rounded-full bg-black object-cover shadow-lg shadow-primary/25" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{store?.name ?? "RP iPhones"}</h1>
            <p className="text-sm text-muted-foreground">Entre para acessar o sistema de gestão</p>
          </div>
        </div>
        <div className="rounded-3xl border bg-card p-6 shadow-soft">
          <LoginForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
