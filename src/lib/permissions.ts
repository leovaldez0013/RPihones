// Matriz de permissões por perfil. Usada no servidor (actions/queries) e na UI (esconder menus).
import type { Role } from "@/domain/constants";

export const PERMISSIONS = {
  "dashboard.view": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],
  "dashboard.financial": ["ADMIN", "GERENTE"],

  "devices.view": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],
  "devices.edit": ["ADMIN", "GERENTE"],
  "devices.viewCost": ["ADMIN", "GERENTE"],
  "accessories.view": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],
  "accessories.edit": ["ADMIN", "GERENTE"],
  "accessories.move": ["ADMIN", "GERENTE", "TECNICO"],
  "catalog.edit": ["ADMIN", "GERENTE"],

  "customers.view": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],
  "customers.edit": ["ADMIN", "GERENTE", "VENDEDOR"],
  "suppliers.view": ["ADMIN", "GERENTE"],
  "suppliers.edit": ["ADMIN", "GERENTE"],
  "purchases.view": ["ADMIN", "GERENTE"],
  "purchases.edit": ["ADMIN", "GERENTE"],

  "sales.view": ["ADMIN", "GERENTE", "VENDEDOR"],
  "sales.create": ["ADMIN", "GERENTE", "VENDEDOR"],
  "sales.cancel": ["ADMIN", "GERENTE"],
  "sales.approveDiscount": ["ADMIN", "GERENTE"],
  "sales.viewAll": ["ADMIN", "GERENTE"],

  "orders.view": ["ADMIN", "GERENTE", "VENDEDOR"],
  "orders.edit": ["ADMIN", "GERENTE", "VENDEDOR"],

  "serviceOrders.view": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],
  "serviceOrders.edit": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],

  "warranty.view": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],
  "warranty.decide": ["ADMIN", "GERENTE", "TECNICO"],

  "imei.check": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],

  "documents.view": ["ADMIN", "GERENTE", "VENDEDOR", "TECNICO"],

  "marketing.view": ["ADMIN", "GERENTE", "VENDEDOR"],

  "finance.view": ["ADMIN", "GERENTE"],
  "finance.edit": ["ADMIN", "GERENTE"],
  "cash.operate": ["ADMIN", "GERENTE", "VENDEDOR"],

  "reports.view": ["ADMIN", "GERENTE"],

  "settings.store": ["ADMIN"],
  "settings.users": ["ADMIN"],
  "settings.operational": ["ADMIN", "GERENTE"],
  "audit.view": ["ADMIN", "GERENTE"],
  "backup.export": ["ADMIN"],
  "simulation.manage": ["ADMIN", "GERENTE"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
