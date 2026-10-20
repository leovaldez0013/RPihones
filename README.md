# RP iPhones — Sistema de Gestão de Loja de iPhone

Sistema web para lojas de iPhones novos e seminovos e acessórios: estoque por IMEI, PDV com troca (upgrade), encomendas, ordens de serviço, documentos, financeiro, marketing pós-venda e relatórios. Interface toda em português, valores em R$, datas em dd/mm/aaaa e fuso America/Sao_Paulo.

## Stack

Next.js 15 (App Router) + TypeScript · Tailwind CSS v4 + shadcn/ui · Prisma (SQLite em dev / PostgreSQL em produção) · Auth.js v5 · Zod + React Hook Form · TanStack Table · Recharts · @react-pdf/renderer · date-fns (pt-BR) · Vitest.

## O que o sistema faz

| Módulo | Onde | Destaques |
|---|---|---|
| Dashboard | `/dashboard` | Vendas do dia e do mês com comparação, lucro, gráfico de 30 dias, mais vendidos, estoque parado, OS, encomendas, contas da semana, caixa, aniversariantes e tarefas — cada perfil vê só o que lhe cabe |
| PDV | `/vendas/nova` | Leitor de código de barras, vários pagamentos, parcelado com juros, troca com avaliação sugerida, desconto com aprovação do gerente, orçamento |
| Estoque | `/estoque` | Aparelhos por IMEI (Luhn + TAC), acessórios e peças, etiquetas com código de barras/QR, alerta de parados |
| Compras | `/compras` | Pedidos a fornecedor com recebimento parcial e compra de usado de pessoa física |
| Encomendas | `/encomendas` | Sinal, aviso automático quando chega aparelho compatível, reserva e entrega pelo PDV |
| Ordens de serviço | `/os` | Kanban arrastável, peças com baixa no estoque, custo somado ao aparelho, cobrança no financeiro |
| Teste de IMEI | `/imei` | Validação local e consulta de bloqueio por provedor configurável |
| Clientes e marketing | `/clientes`, `/marketing` | Ficha completa, tarefas de pós-venda, aniversários, segmentos, campanhas por WhatsApp (LGPD) |
| Documentos | em cada venda/OS/encomenda | Modelos editáveis, PDF, assinatura na tela, link para o cliente |
| Financeiro | `/financeiro` | Contas a pagar/receber, caixa por turno, fluxo de caixa, DRE, comissões, taxas da maquininha |
| Relatórios | `/relatorios` | Vendas, margem por modelo, curva ABC, giro de estoque, trocas, formas de pagamento e vendedores — PDF, Excel e CSV |
| Configurações | `/configuracoes` | Loja, usuários, parâmetros, catálogo, avaliação de troca, documentos, comissões, garantias, auditoria e backup |

## Como rodar (desenvolvimento)

Pré-requisito: **Node.js 20+** (testado com Node 24).

```bash
npm install
cp .env.example .env        # no Windows: copy .env.example .env
npm run db:push             # cria o banco SQLite (prisma/dev.db)
npm run db:seed             # prepara para uso: usuários, loja, catálogo, taxas e acessórios
npm run dev                 # http://localhost:3000
```

O banco começa **limpo para uso real**: sem aparelhos, fornecedores, clientes, vendas, OS ou lançamentos, com saldos das contas em zero e consulta de IMEI desligada.

Quer conhecer o sistema com dados fictícios (6 meses de vendas, OS, encomendas…)? Use um banco separado ou rode `npm run db:reset:demo` (**apaga tudo** e popula a demonstração). Para voltar ao banco limpo: `npm run db:reset` (também apaga tudo).

### Usuários iniciais (criados pelo seed)

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
| `DIRECT_URL` | não | Conexão direta do PostgreSQL (quando `DATABASE_URL` usa pooler) |
| `BLOB_READ_WRITE_TOKEN` | produção | Vercel Blob: fotos e anexos (sem ele, vão para `public/uploads`) |
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
| `npm run db:seed` | Dados iniciais para uso (sem cadastros de demonstração) |
| `npm run db:seed:demo` | Dados de demonstração (em banco vazio) |
| `npm run db:reset` | **Apaga tudo** e roda o seed limpo |
| `npm run db:reset:demo` | **Apaga tudo** e roda o seed de demonstração |
| `npm run catalog:sync` | Adiciona ao banco os modelos novos de `prisma/data/catalog.ts` (ex.: iPhone 18) sem apagar nada |
| `npm run db:studio` | Abre o Prisma Studio |
| `npm run test:postgres` | Roda os testes e o seed num PostgreSQL portátil (verificação antes do deploy) |

## Deploy (Vercel + Neon)

O repositório fica em SQLite para o desenvolvimento. No build da Vercel, se `DATABASE_URL` for PostgreSQL, o script `scripts/prepare-db.mjs` converte o schema, gera o Prisma Client, aplica as tabelas (`prisma db push`, que recusa mudanças que apagariam dados) e roda o seed inicial (só cria usuários, loja e catálogo quando o banco está vazio).

1. **Banco:** crie um projeto no [Neon](https://neon.tech) (PostgreSQL 17, região São Paulo — *aws-sa-east-1*). Copie duas conexões: a **pooled** (host com `-pooler`) e a **direta**.
2. **Vercel:** importe o repositório do GitHub (framework Next.js, sem mudar os comandos).
3. **Armazenamento de fotos:** no projeto da Vercel, *Storage → Create → Blob* e conecte ao projeto. A Vercel cria a variável `BLOB_READ_WRITE_TOKEN` sozinha. Fotos e anexos vão direto do navegador para o Blob (sem o limite de 4,5 MB das funções).
4. **Variáveis de ambiente** (*Settings → Environment Variables*, em Production):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | conexão **pooled** do Neon, terminando em `?sslmode=require&pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | conexão **direta** do Neon (`?sslmode=require`) — usada para criar as tabelas |
   | `AUTH_SECRET` | gere com `npx auth secret` |
   | `AUTH_TRUST_HOST` | `true` |
   | `CRON_SECRET` | um texto aleatório longo (tarefas automáticas diárias, `vercel.json`) |
   | `BLOB_READ_WRITE_TOKEN` | criada no passo 3 |
   | `IMEI_API_URL` / `IMEI_API_KEY` | opcionais (consulta de bloqueio) |

5. **Deploy.** No primeiro build as tabelas e os usuários iniciais são criados. Entre com `admin@rpiphones.com.br` / `admin123` e **troque todas as senhas** em Configurações → Usuários (e desative os usuários que não forem da loja).
6. Ajuste os dados da loja, as taxas da maquininha, os saldos iniciais das contas e o provedor de IMEI.

Observações:
- Previews da Vercel usam as mesmas variáveis se você marcá-las também em *Preview*; para não mexer no banco real a partir de previews, deixe `DATABASE_URL` só em Production.
- `DB_PUSH_ON_BUILD=0` e `SEED_ON_BUILD=0` desligam a criação automática de tabelas/seed no build.
- O modo **Simulação** e o **Teste do app** funcionam só com o banco local (SQLite); em produção a tela avisa e não faz nada.
- O plano gratuito (Hobby) da Vercel é para uso não comercial; para a loja, use o plano Pro.
- Backup: o Neon guarda o histórico do banco (restauração por data); o botão Configurações → Backup baixa um JSON completo.

### Testar no PostgreSQL antes de subir

```bash
npm run test:postgres
```

Sobe um PostgreSQL 17 portátil (sem instalar nada), roda todos os testes automáticos e o seed de demonstração nele e volta o ambiente para SQLite. Pare o `npm run dev` antes. Com `-- --serve`, deixa o banco ligado com a demonstração para abrir o app nele.

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
- **Teste de IMEI — provedor plugável** (`src/features/imei/providers.ts`): *Nenhum* (só validação local: dígito verificador + modelo pelo TAC), *Demonstração* (resultado simulado: penúltimo dígito 9 = bloqueado, 8 = Buscar iPhone ativo) e *API HTTP* genérica. Não escolhemos um fornecedor pago por você: informe o endereço (use `{imei}` na URL ou ele vai como `?imei=`) e a chave em Configurações → Parâmetros gerais (só Admin) ou em `IMEI_API_URL`/`IMEI_API_KEY`. A chave vai nos cabeçalhos `Authorization: Bearer` e `X-API-Key`, nunca é exibida de volta nem gravada no log, e a resposta é normalizada para os nomes de campo mais comuns (blacklist, FMI/iCloud, operadora, garantia).
- **IMEI bloqueado** na última consulta gera alerta vermelho e notificação, e **impede** vender o aparelho, recebê-lo na troca e comprá-lo de pessoa física. “Buscar iPhone ativo” é só alerta (o cliente pode desativar na hora).
- Consultas feitas antes do cadastro (ex.: na avaliação da troca) ficam ligadas ao aparelho quando ele entra no estoque.
- **Marketing e LGPD:** mensagens de *relacionamento* (pós-venda, garantia vencendo) podem ir para qualquer cliente com telefone; mensagens de *marketing* (aniversário, upgrade, reativação, acessórios, VIP) só para quem marcou o consentimento no cadastro — o servidor recusa o envio caso contrário. A exportação de segmentos (CSV/Excel) traz a coluna “Aceita marketing”.
- **WhatsApp sem API paga:** cada envio abre o `wa.me` com a mensagem pronta para um cliente por vez (sem disparo em massa, que viola as regras do WhatsApp) e fica registrado no histórico do cliente.
- **Tarefas automáticas** (aniversários nos próximos 3 dias e garantias vencendo) são geradas de forma idempotente ao abrir Marketing/Dashboard (no máximo a cada 10 min) e pela rota `/api/cron/tarefas` (Vercel Cron diário via `vercel.json`; defina `CRON_SECRET`). O pós-venda D+N nasce na própria venda.
- Vendedor vê as próprias tarefas e as sem responsável; gerente e admin veem todas.
- **Dashboard:** comparações são *hoje × ontem* e *mês até hoje × mesmo período do mês anterior* (comparação justa no meio do mês). Vendedor vê só os próprios números e a comissão; técnico vê o painel de OS.
- **Relatórios:** o período é inclusivo (de 1º até hoje por padrão), no fuso de São Paulo. Excel/CSV saem com valores em reais (número) para somar na planilha; o PDF é gerado no servidor em A4 (paisagem quando há muitas colunas).
- **Backup:** Configurações → Backup dos dados baixa um JSON com todas as tabelas (só administrador; senhas apenas como hash e chave da API de IMEI omitida). Em produção, use também o backup automático do Neon/Supabase.
- **Seed limpo por padrão:** o banco inicial traz só o que é configuração (usuários, loja, catálogo de modelos, taxas da maquininha, tabela de avaliação, comissões, garantias) e o cadastro de acessórios/peças. Aparelhos, fornecedores, OS, clientes e movimentações vêm apenas na demonstração (`db:seed:demo`).
- **Novos modelos de iPhone:** inclua em `prisma/data/catalog.ts` e rode `npm run catalog:sync` — cria o modelo e um valor base de troca estimado (revise em Configurações → Avaliação de troca). Também dá para cadastrar pela tela em Configurações → Catálogo.
- **TACs:** no uso real a tabela começa vazia e o sistema aprende o TAC verdadeiro de cada modelo a cada aparelho cadastrado; TACs fictícios existem só na demonstração.
- **IMEI opcional:** o aparelho pode entrar só com modelo, cor e armazenamento (aparece como "Sem IMEI" e recebe o IMEI depois, editando). Quando informado: só números, 15 dígitos (espaços, traços e pontos colados são ignorados), dígito verificador (Luhn) e sem duplicidade. Troca e compra de pessoa física continuam exigindo IMEI (comprova a procedência no termo). Etiqueta de aparelho sem IMEI usa o nº de série ou o código interno, que o PDV também encontra.
- **TAC → modelo:** a tabela começa vazia e aprende a cada cadastro com IMEI. Se o modelo escolhido diverge do TAC já conhecido, o sistema pergunta "Este IMEI costuma ser do X. Confirma?" e, confirmando, salva sem alterar a tabela (corrija associações em Configurações → Catálogo → Tabela TAC).
- **Simulação de 1 mês** (menu Simulação, admin/gerente): roda num banco separado (`prisma/simulacao.db`), criado como cópia das configurações reais. Enquanto ativa, aparece a faixa "MODO SIMULAÇÃO" e o app inteiro usa só esse banco — é impossível misturar com o estoque real. Os TACs inventados ficam só nela. "Voltar aos dados reais" guarda a simulação; "Apagar simulação" remove o arquivo. Funciona com o banco local (SQLite).
- **Garantias:** cada item de venda e cada OS de cliente entregue gera uma garantia automática (prazos em Configurações → Garantias: por condição do aparelho, acessório e serviço). Tela Garantias: ativas, vencendo em 7 dias, vencidas e acionamentos. Acionar → em análise → **aprovar** abre uma OS do tipo "Garantia" (valor zero, sem cobrança) acompanhada no Kanban até a entrega, que conclui o acionamento; **negar** exige o motivo (ex.: mau uso). Venda cancelada ou devolvida cancela as garantias dela; garantia vencida não pode ser acionada.
- **Encomendas:** Pendente → Encomendado → Chegou → Entregue (ou Cancelada). "Registrar chegada" dá entrada no estoque já reservada ao cliente; "Entregar" gera a venda automaticamente pelo valor combinado, abatendo o sinal. Desconto do valor combinado acima do limite do vendedor continua exigindo aprovação do gerente.
- **OS:** etapa "Em análise" (antes "Em diagnóstico"); aparelho do cliente informado por modelo e cor do catálogo, IMEI opcional.
- **Teste do app** (página Simulação): gera a simulação completa, confere o que foi gerado, exercita cada função com os mesmos serviços das telas (estoque, vendas em todas as formas de pagamento, troca, cancelamento, OS em todos os status, encomendas, garantias), compara o painel com a soma dos registros, apaga a simulação comparando uma "impressão digital" do banco real antes e depois, e gera uma simulação nova e limpa. O relatório fica em `prisma/teste-app.json` (fora do git).
