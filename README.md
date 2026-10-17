# RP iPhones — Sistema de Gestão de Loja de iPhone

Sistema web para lojas de iPhones novos e seminovos e acessórios: estoque por IMEI, PDV com troca (upgrade), encomendas, ordens de serviço, documentos, financeiro, marketing pós-venda e relatórios. Interface toda em português, valores em R$, datas em dd/mm/aaaa e fuso America/Sao_Paulo.

## Stack

Next.js 15 (App Router) + TypeScript · Tailwind CSS v4 + shadcn/ui · Prisma (SQLite em dev / PostgreSQL em produção) · Auth.js v5 · Zod + React Hook Form · TanStack Table · Recharts · @react-pdf/renderer · date-fns (pt-BR) · Vitest.

## Como rodar (desenvolvimento)

Pré-requisito: **Node.js 20+** (testado com Node 24).

```bash
npm install
cp .env.example .env        # no Windows: copy .env.example .env
npm run db:push             # cria o banco SQLite (prisma/dev.db)
npm run db:seed             # popula com dados de demonstração
npm run dev                 # http://localhost:3000
```

Para **zerar** o banco e popular de novo: `npm run db:reset` (apaga todos os dados locais).

### Usuários de demonstração (criados pelo seed)

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@rpiphones.com.br | admin123 |
| Gerente | gerente@rpiphones.com.br | gerente123 |
| Vendedor | lucas@rpiphones.com.br | vendedor123 |
| Vendedor | marina@rpiphones.com.br | vendedor123 |
| Técnico | tecnico@rpiphones.com.br | tecnico123 |

> Troque as senhas em **Configurações → Usuários** antes de usar em produção.

## Variáveis de ambiente (`.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | `file:./dev.db` (SQLite) ou `postgresql://…` |
| `AUTH_SECRET` | sim | Segredo do login. Gere com `npx auth secret` |
| `AUTH_TRUST_HOST` | sim | `true` |
| `CRON_SECRET` | não | Protege `/api/cron/tarefas` (tarefas automáticas) |
| `IMEI_API_URL` / `IMEI_API_KEY` | não | API externa de consulta de IMEI (também configurável na tela) |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) — usam um banco separado `prisma/test.db` |
| `npm run db:push` | Aplica o schema no banco |
| `npm run db:seed` | Dados de demonstração |
| `npm run db:reset` | Zera o banco e roda o seed |
| `npm run db:studio` | Abre o Prisma Studio |
| `npm run db:postgres` | Troca o provider do schema para PostgreSQL |

## Deploy (Vercel + Neon/Supabase)

1. Crie um banco PostgreSQL no [Neon](https://neon.tech) ou [Supabase](https://supabase.com) e copie a connection string.
2. Localmente rode `npm run db:postgres` (altera `prisma/schema.prisma` para `postgresql`) e faça commit.
3. Na Vercel, importe o repositório e configure `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true` (e `CRON_SECRET` se quiser as tarefas automáticas).
4. Com a `DATABASE_URL` de produção no seu terminal, rode uma vez `npx prisma db push` e (opcional) `npm run db:seed`.
5. Faça o deploy. O build roda `prisma generate` automaticamente (`postinstall`).

> Uploads de fotos/anexos: em desenvolvimento vão para `public/uploads`. Na Vercel o disco é temporário — para produção configure um storage (Vercel Blob/S3) na camada `src/lib/storage.ts`.

## Estrutura

```
src/
  app/(auth)/login          tela de login
  app/(app)/…               telas do sistema (layout com sidebar, busca Ctrl+K, ações rápidas)
  app/api/…                 rotas (auth, busca global, PDFs, exportações, cron)
  features/<módulo>/        schemas Zod, server actions e regras de negócio por módulo
  domain/                   lógica pura e testada (dinheiro, IMEI, parcelas, troca, DRE…)
  lib/                      banco, sessão, permissões, auditoria, formatação, máscaras
  components/ui             componentes shadcn/ui
  components/shared         DataTable, StatusBadge, EmptyState, inputs com máscara…
prisma/schema.prisma        modelo de dados
prisma/seed/                dados de demonstração
tests/                      testes das regras críticas
```

## Perfis e permissões

| Perfil | Acesso |
|---|---|
| Administrador | Tudo, incluindo usuários, dados da empresa e backup |
| Gerente | Tudo exceto usuários e dados da empresa; aprova descontos acima do limite |
| Vendedor | Vendas, clientes, encomendas, OS, consulta de estoque. **Não vê custo nem margem** (removidos no servidor) |
| Técnico | Ordens de serviço e consulta de aparelhos |

A matriz completa está em `src/lib/permissions.ts`. Toda ação do servidor valida os dados com Zod e checa a permissão; alterações importantes vão para o **log de auditoria** (Configurações → Log de auditoria).

## Decisões tomadas

- **SQLite em desenvolvimento** para não exigir instalação de banco; o schema não usa recursos exclusivos (status são textos validados no código, JSON é guardado como texto), então troca para PostgreSQL só mudando o provider.
- **Valores em centavos** (inteiros) em todo o sistema.
- **Nada é apagado de verdade**: registros têm `deletedAt` (soft delete) e as ações ficam no log de auditoria.
- **`prisma db push`** em vez de migrações versionadas — mais simples para o lojista; dá para migrar para `prisma migrate` depois.
- Busca sem diferenciar maiúsculas funciona em SQLite e PostgreSQL (helper `ci()` em `src/lib/db.ts`).
- **Encomendas:** o sinal entra no financeiro na hora (categoria “Sinal”, fora do DRE) e é abatido na venda de entrega. Quando entra no estoque um aparelho compatível (modelo, e capacidade/cor/condição/preço máximo quando informados), o sistema notifica; a reserva é feita com um clique na encomenda. Cancelar permite devolver ou reter o sinal.
- **Ordens de serviço — dois tipos:** *Interna* (preparar aparelho do estoque: o aparelho fica “Em manutenção” e, ao concluir, mão de obra + peças somam ao custo real dele) e *De cliente* (reparo: gera comprovante de entrada e de entrega; o valor cobrado vira conta a receber/recebida na categoria “Serviços”).
- **Peças da OS** saem do estoque no momento em que são lançadas (custo médio atual) e voltam se forem removidas ou se a OS for cancelada.
- **Valor cobrado da OS é um total único** (serviço + peças), que é o que entra no financeiro e no DRE. O preço por peça é só referência.
- **Kanban:** soltar o cartão em “Entregue” abre a confirmação de entrega (com a forma de recebimento); a coluna mostra as entregues dos últimos 14 dias. Cancelar é feito na tela da OS.
- Aparelho vendido ou reservado não entra em OS interna; para reparo de aparelho já vendido use OS de cliente (o IMEI é reconhecido e ligado ao histórico do aparelho).
