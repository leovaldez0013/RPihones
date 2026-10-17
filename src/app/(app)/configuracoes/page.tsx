import type { Metadata } from "next";
import Link from "next/link";
import {
  Store,
  Users,
  SlidersHorizontal,
  History,
  Smartphone,
  Repeat,
  FileText,
  Percent,
  ShieldCheck,
  CreditCard,
  ChevronRight,
  DatabaseBackup,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";

export const metadata: Metadata = { title: "Configurações" };

type Section = { href: string; title: string; description: string; icon: LucideIcon; permission: Permission };

const SETTINGS_SECTIONS: Section[] = [
  { href: "/configuracoes/loja", title: "Dados da loja", description: "Nome, CNPJ, endereço, logo, contatos e redes sociais", icon: Store, permission: "settings.store" },
  { href: "/configuracoes/usuarios", title: "Usuários e permissões", description: "Vendedores, gerentes, técnicos, comissões e limites de desconto", icon: Users, permission: "settings.users" },
  { href: "/configuracoes/geral", title: "Parâmetros gerais", description: "Alerta de estoque parado, pós-venda, aparelho de troca e consulta de IMEI", icon: SlidersHorizontal, permission: "settings.operational" },
  { href: "/configuracoes/catalogo", title: "Catálogo de modelos", description: "Modelos de iPhone, cores, capacidades e tabela TAC", icon: Smartphone, permission: "catalog.edit" },
  { href: "/configuracoes/avaliacao", title: "Avaliação de troca", description: "Tabela modelo × capacidade e ajustes por bateria, grade e checklist", icon: Repeat, permission: "settings.operational" },
  { href: "/configuracoes/documentos", title: "Modelos de documentos", description: "Recibo, garantia, termo de troca, encomenda, OS e orçamento", icon: FileText, permission: "settings.operational" },
  { href: "/financeiro/contas", title: "Taxas da maquininha", description: "Taxa por parcela, juros repassados ao cliente e prazo de recebimento", icon: CreditCard, permission: "finance.view" },
  { href: "/configuracoes/comissoes", title: "Comissões", description: "% por vendedor e categoria (novo, seminovo, acessório, serviço)", icon: Percent, permission: "settings.operational" },
  { href: "/configuracoes/garantias", title: "Prazos de garantia", description: "Dias de garantia por condição e cláusulas de exclusão", icon: ShieldCheck, permission: "settings.operational" },
  { href: "/marketing/modelos", title: "Mensagens de WhatsApp", description: "Pós-venda, aniversário, garantia e campanhas", icon: MessageSquareText, permission: "settings.operational" },
  { href: "/api/backup", title: "Backup dos dados", description: "Baixar todas as informações do sistema (JSON)", icon: DatabaseBackup, permission: "backup.export" },
  { href: "/configuracoes/auditoria", title: "Log de auditoria", description: "Quem fez o quê e quando", icon: History, permission: "audit.view" },
];

/** Rotas de API (download do backup) não passam pelo roteador do Next. */
function Item({ href, ...props }: React.ComponentProps<"a"> & { href: string }) {
  return href.startsWith("/api") ? <a href={href} download {...props} /> : <Link href={href} {...props} />;
}

export default async function SettingsPage() {
  const user = await requirePage("settings.operational");
  const sections = SETTINGS_SECTIONS.filter((s) => can(user.role, s.permission));
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Configurações" description="Ajuste o sistema ao jeito da sua loja." />
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <Item
            key={s.href}
            href={s.href}
            className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.description}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Item>
        ))}
      </div>
    </div>
  );
}
