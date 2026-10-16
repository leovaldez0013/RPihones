import type { Metadata } from "next";
import { Smartphone } from "lucide-react";
import { db } from "@/lib/db";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const store = await db.storeSettings.findUnique({ where: { id: "default" } }).catch(() => null);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Smartphone className="size-7" />
          </div>
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
