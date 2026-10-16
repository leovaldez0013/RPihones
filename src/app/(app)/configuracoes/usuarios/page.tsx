import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { db } from "@/lib/db";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  await requirePage("settings.users");
  const users = await db.user.findMany({ where: { deletedAt: null }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Usuários e permissões" description="Quem acessa o sistema e o que cada um pode fazer." back="/configuracoes" />
      <UsersTable
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          phone: u.phone ?? "",
          commissionPct: u.commissionPct,
          discountLimitPct: u.discountLimitPct,
          active: u.active,
        }))}
      />
    </div>
  );
}
