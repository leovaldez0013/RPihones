import { requirePage } from "@/lib/session";
import { FinanceTabs } from "./finance-tabs";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  return (
    <div className="flex flex-col gap-4">
      <FinanceTabs role={user.role} />
      {children}
    </div>
  );
}
