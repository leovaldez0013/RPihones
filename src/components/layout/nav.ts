import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Smartphone,
  Headphones,
  Truck,
  Building2,
  Users,
  PackageSearch,
  Wrench,
  ScanLine,
  Megaphone,
  Wallet,
  Banknote,
  BarChart3,
  Settings,
  FlaskConical,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavItem = { title: string; href: string; icon: LucideIcon; permission: Permission };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Geral",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
      { title: "Simulação", href: "/simulacao", icon: FlaskConical, permission: "simulation.manage" },
    ],
  },
  {
    label: "Vendas",
    items: [
      { title: "PDV — Nova venda", href: "/vendas/nova", icon: ShoppingCart, permission: "sales.create" },
      { title: "Vendas", href: "/vendas", icon: Receipt, permission: "sales.view" },
      { title: "Encomendas", href: "/encomendas", icon: PackageSearch, permission: "orders.view" },
      { title: "Clientes", href: "/clientes", icon: Users, permission: "customers.view" },
      { title: "Marketing", href: "/marketing", icon: Megaphone, permission: "marketing.view" },
      { title: "Caixa", href: "/financeiro/caixa", icon: Banknote, permission: "cash.operate" },
    ],
  },
  {
    label: "Estoque",
    items: [
      { title: "Aparelhos", href: "/estoque/aparelhos", icon: Smartphone, permission: "devices.view" },
      { title: "Acessórios", href: "/estoque/acessorios", icon: Headphones, permission: "accessories.view" },
      { title: "Compras", href: "/compras", icon: Truck, permission: "purchases.view" },
      { title: "Fornecedores", href: "/fornecedores", icon: Building2, permission: "suppliers.view" },
      { title: "Teste de IMEI", href: "/imei", icon: ScanLine, permission: "imei.check" },
    ],
  },
  {
    label: "Serviços",
    items: [
      { title: "Ordens de serviço", href: "/os", icon: Wrench, permission: "serviceOrders.view" },
      { title: "Garantias", href: "/garantias", icon: ShieldCheck, permission: "warranty.view" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Financeiro", href: "/financeiro", icon: Wallet, permission: "finance.view" },
      { title: "Relatórios", href: "/relatorios", icon: BarChart3, permission: "reports.view" },
      { title: "Configurações", href: "/configuracoes", icon: Settings, permission: "settings.operational" },
    ],
  },
];
