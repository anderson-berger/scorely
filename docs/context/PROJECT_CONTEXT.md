# PROJECT_CONTEXT — app-base

> Mapa gerado por leitura do código em 2026-11-05. Legenda: ✅ encontrado · 🟡 inferido · ❌ não existe.
> Nenhum segredo copiado; só nomes de variáveis.

## 1. Visão geral

| Item      | Valor                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Nome      | ✅ `app-base` (monorepo)                                                                                                          |
| Propósito | ✅ Monorepo de vários projetos web: Vue 3 + Quasar (front) e Serverless v4 + Lambda + DynamoDB (back)                             |
| Projetos  | ✅ `base` = template de referência · ✅ `scorely` = gerenciamento de grupos esportivos ("pelada")                                 |
| Estado    | 🟡 `base`: funcional como template. `scorely`: **parcial**, com login, perfil e notificações; o domínio (grupos) ainda não existe |
| Git       | ✅ Repositório sem nenhum commit (tudo untracked). Branch atual `master`; branch principal esperada `main`                        |

## 2. Árvore de pastas (3 níveis)

```
.devcontainer/            ✅ Dockerfile (node 24 + AWS CLI) + docker-compose (app + LocalStack)
infra/
  shared/                 ✅ single-table.ts (schema da tabela), infra-service.ts (stack), setup-local.ts (LocalStack)
  base/                   ✅ stack `base-infra` (tabela + Outputs)
  scorely/                 ✅ stack `scorely-infra` (tabela + Outputs)
apps/
  base/
    api/                  ✅ @base/api: lambdas health + items
    web/                  ✅ @base/web: SPA com a página de items
  scorely/
    api/                  ✅ @scorely/api: lambdas health, auth, users, notifications
    web/                  ✅ @scorely/web: SPA com login, home, perfil e sino de notificações
serverless-compose.ts     ✅ orquestra o deploy (infra → api)
CLAUDE.md, README.md      ✅ convenções e guia
```

Padrão interno ✅: `api/src/lib/*` (env, dynamo, http...) + `api/src/modules/<mod>/{functions,handlers,service,repository,schema,test}.ts`; `web/src/modules/<mod>/{routes,schema,api,store,pages}`.

## 3. Monorepo

✅ npm workspaces (`apps/*/*`, `infra/*`) + Turborepo. npm 12.2.1, Node >= 24.

| Workspace            | Caminho                  | Papel                                             | Depende de                                         |
| -------------------- | ------------------------ | ------------------------------------------------- | -------------------------------------------------- |
| `@base/infra`        | `infra/base`             | Stack de infra (tabela)                           | `infra/shared` (import relativo)                   |
| `@scorely/infra`     | `infra/scorely`          | Stack de infra (tabela)                           | `infra/shared` (import relativo)                   |
| `@base/api`          | `apps/base/api`          | API Lambda                                        | `@base/infra` (devDep, para o `db:setup` do Turbo) |
| `@scorely/api`       | `apps/scorely/api`       | API Lambda                                        | `@scorely/contracts`, `@scorely/infra` (devDep)    |
| `@base/web`          | `apps/base/web`          | SPA                                               | nenhum workspace                                   |
| `@scorely/web`       | `apps/scorely/web`       | SPA                                               | `@scorely/contracts`                               |
| `@scorely/contracts` | `apps/scorely/contracts` | Schemas Zod + tipos da API (sem build)            | só `zod`                                           |
| `packages/*`         | —                        | ❌ não existe pacote compartilhado entre projetos | —                                                  |

## 4. Infra / Serverless

### Serverless Compose (`serverless-compose.ts`) ✅

| Serviço         | Caminho            | Ordem | Depende de                                    |
| --------------- | ------------------ | ----- | --------------------------------------------- |
| `base-infra`    | `infra/base`       | 1     | —                                             |
| `base-api`      | `apps/base/api`    | 2     | `base-infra.TableName` → param `tableName`    |
| `scorely-infra` | `infra/scorely`    | 1     | —                                             |
| `scorely-api`   | `apps/scorely/api` | 2     | `scorely-infra.TableName` → param `tableName` |

- ✅ A api lê `${param:tableName, self:custom.localTableName}`, com fallback para o dev local fora do compose.
- ✅ Shared State do compose num bucket S3 + parâmetro SSM em `us-east-1` (pelo README).

### Recursos AWS por stack

| Stack                                | Recursos                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<proj>-infra`                       | ✅ `AWS::DynamoDB::Table` `<proj>-<stage>`, PAY_PER_REQUEST, PK/SK, TTL em `ttl`, `DeletionPolicy: Retain`. Outputs: `TableName`, `TableArn`                     |
| `base-api`                           | ✅ Lambdas + HTTP API (CORS aberto) + IAM DynamoDB (Get/Put/Update/Delete/Query/BatchGet/ConditionCheck)                                                         |
| `scorely-api`                        | ✅ igual a `base-api`, mais IAM `ses:SendEmail` + segredo do SSM `/scorely/<stage>/auth-secret` + Lambda authorizer `auth` (função `authAuthorizer`) no HTTP API |
| S3 / fila / CloudFront / hosting web | ❌ nada declarado                                                                                                                                                |

Runtime ✅ `nodejs22.x`, 256 MB, 10 s, esbuild (bundle + sourcemap), plugin `serverless-offline`.

### Rotas HTTP

| Projeto | Método | Path                       | Função                   | Auth                                      |
| ------- | ------ | -------------------------- | ------------------------ | ----------------------------------------- |
| base    | GET    | `/health`                  | health                   | ❌                                        |
| base    | POST   | `/items`                   | itemsCreate              | ❌                                        |
| base    | GET    | `/items`                   | itemsList                | ❌                                        |
| base    | GET    | `/items/{id}`              | itemsGet                 | ❌                                        |
| scorely | GET    | `/health`                  | health                   | ❌                                        |
| scorely | POST   | `/auth/code`               | authRequestCode          | ❌                                        |
| scorely | POST   | `/auth/verify`             | authVerifyCode           | ❌                                        |
| scorely | POST   | `/auth/refresh`            | authRefresh              | ❌                                        |
| scorely | POST   | `/auth/logout`             | authLogout               | ✅ authorizer (encerra a sessão do token) |
| scorely | GET    | `/me`                      | usersMe                  | ✅ authorizer                             |
| scorely | PATCH  | `/me`                      | usersUpdateMe            | ✅ authorizer                             |
| scorely | GET    | `/notifications`           | notificationsList        | ✅ authorizer                             |
| scorely | POST   | `/notifications/{id}/read` | notificationsMarkRead    | ✅ authorizer                             |
| scorely | POST   | `/notifications/read-all`  | notificationsMarkAllRead | ✅ authorizer                             |

✅ "authorizer" = `authorizer: { name: AUTHORIZER }` no evento do `functions.ts`. O API Gateway valida o `Authorization: Bearer` antes da rota: sem header → 401, token inválido/expirado → 403.

### Stages

- ✅ `stage: ${opt:stage, 'dev'}` em todos os serviços. Não há config específica de `stage` ou `prod` (❌ arquivos ou blocos por stage).
- ✅ Região fixa `sa-east-1`.
- ✅ Local: `serverless offline` + LocalStack, tabela `<proj>-dev`.

### Domínios

- ❌ Nenhum domínio, subdomínio, wildcard, CloudFront, certificado ACM ou Route53 configurado. A API usaria a URL padrão do HTTP API (🟡).

## 5. Dados

| Item       | Valor                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| Banco      | ✅ DynamoDB, uma tabela por projeto (`<proj>-<stage>`), single-table, **sem GSI/LSI**      |
| Cliente    | ✅ `@aws-sdk/lib-dynamodb` (DocumentClient). ❌ Sem ORM                                    |
| Migrations | ❌ Não existem (schemaless; a tabela é criada pelo CloudFormation e pelo `setup-local.ts`) |
| Postgres   | ❌                                                                                         |

### Entidades e itens

| Projeto | Item           | PK / SK                                                   | Campos principais                                                 |
| ------- | -------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| base    | Item           | `ITEM#<id>` / `META`                                      | id, name, description?, createdAt                                 |
| base    | Lookup (lista) | `LOOKUP#ITEM` / `<createdAt>#<id>`                        | id                                                                |
| scorely | User           | `USER#<id>` / `META`                                      | id, email, name?, nickname?, gender? (`M`/`F`), createdAt         |
| scorely | Lookup email   | `LOOKUP#USER#EMAIL#<email>` / `META` (único)              | id                                                                |
| scorely | LoginCode      | `AUTH#CODE#<email>` / `META` (com `ttl`)                  | codeHash, attempts, expiresAt, sentAt, windowStart, windowCount   |
| scorely | Session        | `SESSION#<id>` / `META` (com `ttl`)                       | userId, tokenHash, createdAt, expiresAt                           |
| scorely | Notification   | `NOTIFICATION#<id>` / `META`                              | userId, type (`welcome`), title, body?, link?, createdAt, readAt? |
| scorely | Lookup lista   | `LOOKUP#USER#NOTIFICATIONS#<userId>` / `<createdAt>#<id>` | id                                                                |
| scorely | Inbox          | `INBOX#<userId>` / `META`                                 | unread (contador via `ADD`)                                       |

### Multi-tenant

- ❌ Não existe: sem `tenant_id`, sem resolução por subdomínio. O isolamento atual é por **projeto** (uma tabela por projeto) e, dentro do scorely, por `userId`.

## 6. Autenticação e sessão

| Item                             | Status                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login (scorely)                  | ✅ passwordless: código de 6 dígitos por email (`/auth/code` → `/auth/verify`)                                                                                  |
| Cadastro                         | ✅ automático no primeiro `verify`; o front força o preenchimento do perfil (nome) depois                                                                       |
| Access token                     | ✅ JWT HS256 próprio (`lib/jwt.ts`), 1h                                                                                                                         |
| Refresh token                    | ✅ 30 dias, rotacionado a cada refresh; reuso de token já trocado derruba a sessão                                                                              |
| Limites                          | ✅ reenvio a cada 60s, 5 códigos/h por email, 5 tentativas por código, validade de 10 min                                                                       |
| Validação do token               | ✅ Lambda authorizer do HTTP API (`authAuthorizer`, payload 2.0, resposta simples, sem cache), declarado por rota no `functions.ts`                             |
| Contexto no handler              | ✅ `authHandlers({...})`/`authHandler` (`apps/scorely/api/src/lib/auth.ts`) lê `requestContext.authorizer.lambda` → `{ userId, sessionId }`; sem contexto → 401 |
| Cookies                          | ❌. Os tokens ficam no `localStorage` do front (`scorely.session`)                                                                                              |
| Cognito                          | ❌ (decisão explícita no README)                                                                                                                                |
| Envio de email                   | ✅ `EMAIL_MODE=console` (só log, padrão) ou `ses`. 🟡 SES ainda sem domínio verificado                                                                          |
| Auth no `base`                   | ❌                                                                                                                                                              |
| Papéis / "platform" vs "produto" | ❌ Não existe separação nem roles. O único tipo de usuário é `User`                                                                                             |

## 7. Front-end

| Item      | Valor                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Apps      | ✅ `@base/web` (porta 5173), `@scorely/web` (porta 5174). ❌ Não há app "vitrine" nem "platform"                                         |
| Framework | ✅ Vite 8 + Quasar 2 (via `@quasar/vite-plugin`, **não** Quasar CLI) + Pinia + Vue Router 5 + axios + Zod 4                              |
| Vue       | ✅ 3.5, **Options API** (`<script lang="ts">` + `defineComponent`; `setup()` só expõe as stores). Stores Pinia continuam no estilo setup |
| Tenant    | ❌ O front não descobre tenant. A URL da api vem de `VITE_API_URL`, com fallback para localhost                                          |

### Rotas

| App     | Path         | Nome    | Observação                                                     |
| ------- | ------------ | ------- | -------------------------------------------------------------- |
| base    | `/`          | —       | redireciona para `/items`                                      |
| base    | `/items`     | items   | lista + criação de items                                       |
| scorely | `/login`     | login   | pública, tela cheia                                            |
| scorely | `/`          | home    | saudação + placeholder "Seus grupos vão aparecer aqui"         |
| scorely | `/profile`   | profile | perfil; obrigatório no primeiro acesso                         |
| scorely | `*`          | —       | redireciona para `/`                                           |
| scorely | (componente) | —       | ✅ `NotificationBell` no layout. ❌ Sem página de notificações |

✅ Guard global no scorely: sem sessão → `/login?redirect=...`; sem nome → `/profile?welcome=1`. ✅ O interceptor HTTP renova o token no 401 e no 403 do authorizer (403 sem corpo `{ error }`), com um único refresh compartilhado entre as requisições.

## 8. Contratos e validação

- ✅ Zod nos dois lados. No scorely, o contrato fica só em `@scorely/contracts` (`apps/scorely/contracts/src/<mod>.ts`); no base, em `<mod>.schema.ts`. Erro padrão: `{ error: { code, message, details?, requestId? } }` (`ApiErrorSchema`). No scorely, `code` é um enum (`ErrorCodeSchema`), com status e mensagem (em inglês) no catálogo `api/src/lib/errors.ts` e tradução no web via `vue-i18n` (`web/src/i18n/`, pt-BR + en).
- ✅ O front valida as respostas com o schema (`request(config, Schema)`).
- ❌ OpenAPI.
- ✅ scorely: **contrato só em contracts**. A api e a web importam de `@scorely/contracts`; helpers de apresentação (`displayName`, `notificationIcon`) ficam no web.
- 🟡 base: os schemas continuam **duplicados** entre api e web (fica fora do contracts por enquanto).

## 9. Qualidade

| Item        | Valor                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes      | ✅ Vitest, ao lado do código (`*.test.ts`)                                                                                                         |
|             | `base/api`: item.schema (2 casos), item.service (2)                                                                                                |
|             | `scorely/api`: jwt (6), auth (8), auth.service (14), notification.service (3). Total: **35 casos** (31 + 4 do base)                                |
|             | ❌ Sem testes na web (`--passWithNoTests`), nos repositories/handlers nem E2E                                                                      |
| Lint/format | ✅ Biome 2 (`npm run lint` / `npm run format`), preset recommended, aspas simples, lineWidth 110                                                   |
| Typecheck   | ✅ `tsc` (api/infra) e `vue-tsc` (web) via `npm run typecheck`. TS 6 strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`            |
| CI/CD       | ❌ Não existe `.github/` nem outro pipeline. 🟡 O README planeja GitHub Actions com o secret `SERVERLESS_ACCESS_KEY` e Environments `stage`/`prod` |

## 10. Ambiente local

### Devcontainer ✅

| Serviço      | Imagem / detalhe                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `app`        | node:24-bookworm-slim + AWS CLI + npm 12, usuário `node`. Volumes: `node_modules`, `claude-config` |
| `localstack` | localstack 4.9, só `dynamodb`, `PERSISTENCE=1`, porta 4566                                         |
| Postgres     | ❌                                                                                                 |

Portas encaminhadas: 5173, 3000 (base) · 5174, 3010 (scorely) · 4566 (LocalStack). Cada api reserva um bloco de 10 portas (http, +1 websocket, +2 lambda).

### Scripts raiz (`package.json`)

| Script        | O que faz                                                          |
| ------------- | ------------------------------------------------------------------ |
| `dev`         | `turbo run dev`: todos os projetos (roda `db:setup` antes)         |
| `dev:base`    | web + api do base                                                  |
| `dev:scorely` | web + api do scorely                                               |
| `build`       | turbo build (vite build / serverless package)                      |
| `typecheck`   | turbo typecheck                                                    |
| `test`        | turbo test (vitest)                                                |
| `lint`        | `biome check .`                                                    |
| `format`      | `biome check --write .`                                            |
| `db:setup`    | cria as tabelas `<proj>-<stage>` no LocalStack (idempotente)       |
| deploy        | ❌ sem script; manual: `npx serverless deploy --stage <s>` na raiz |

### Variáveis de ambiente (só nomes)

| Variável                                                                        | Onde                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `SERVERLESS_ACCESS_KEY`                                                         | `.devcontainer/.env` (gitignored) / CI                    |
| `DYNAMODB_ENDPOINT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | api local (LocalStack)                                    |
| `STAGE`                                                                         | `setup-local.ts` (padrão `dev`)                           |
| `TABLE_NAME`                                                                    | api (injetada pelo serverless.ts)                         |
| `AUTH_SECRET`                                                                   | scorely api (SSM no deploy; valor fixo de dev no offline) |
| `EMAIL_MODE`, `EMAIL_FROM`                                                      | scorely api                                               |
| `IS_OFFLINE`                                                                    | scorely api (definida pelo serverless-offline)            |
| `VITE_API_URL`                                                                  | web (opcional)                                            |
| `LOCALSTACK_PORT`                                                               | docker-compose (opcional)                                 |
| `AWS_SESSION_TOKEN`, `AWS_PROFILE`, `SERVERLESS_LICENSE_KEY`                    | repassadas pelo turbo.json                                |

## 11. Docs e pasta de agentes

| Arquivo                                                      | Resumo                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `README.md` ✅                                               | Estrutura, como rodar, deploy pelo compose, access key, novo projeto/módulo, DynamoDB, login do scorely, pegadinhas           |
| `CLAUDE.md` ✅                                               | Regras para IA: infra separada da api, single-table sem GSI com lookups, Vue em Options API, auth/TTL/notificações no scorely |
| `docs/` ✅                                                   | Só este arquivo                                                                                                               |
| `AGENTS.md`, `.cursorrules`, `.claude/`, `.github/copilot-*` | ❌                                                                                                                            |

Regras para IA já definidas (CLAUDE.md) ✅:

- Nunca declarar recursos no `serverless.ts` da api; criar em `infra/`, expor como Output, passar pelo compose e ler por `${param:x, self:custom.localX}`.
- IAM por nome ou ARN montado (`Fn::Join`); nunca `Fn::GetAtt` de outro stack. Deploy só pela raiz.
- DynamoDB: proibido GSI/LSI. Lookups guardam só o `id`. Entidade e lookups na mesma `TransactWriteItems`; `attribute_not_exists(PK)` para valores únicos; normalizar as chaves; marcar `entity`; remover PK/SK/entity/ttl antes de devolver.
- web: componentes Vue em Options API (`defineComponent`), nunca `<script setup>`.
- api: `handlers.ts` com as rotas como métodos de `handlers({...})`/`authHandlers({...})` e `export const { a, b } = ...`; handlers devolvem só os dados (200/204) e falham com `appError(code)` do catálogo; back só em inglês, e o web traduz por código via i18n; funções exportadas fora dos handlers são `export function`.
- scorely: rota protegida declara `authorizer: { name: AUTHORIZER }` no `functions.ts` e coloca o método em `authHandlers({...})`; `userId` sempre de `auth.userId`; 403 de regra de negócio sempre com corpo `{ error }`; itens que expiram têm `ttl` **e** `expiresAt`; notificações via `notify()`, com tipo novo na api **e** na web + ícone; contadores com `ADD` na mesma transação.

## 12. Pendências

### TODO/FIXME

- ✅ Nenhum `TODO`/`FIXME` no código.
- 🟡 Pistas de roadmap em comentários: `GenderSchema` "usado no sorteio misto e (depois) no MVP"; tipos de notificação futuros `waitlist_promoted`, `list_opened`; link de exemplo `/groups/<id>`; Home com "Seus grupos vão aparecer aqui".

### Inconsistências / lacunas

- ❌ Nenhum commit no git; o branch local é `master`, mas a branch principal esperada é `main`.
- ❌ O README diz que o "deploy acontece só pelo CI", mas não há CI.
- ❌ Não há hospedagem do front (S3/CloudFront/Amplify), domínio nem certificado. Só as apis têm deploy definido.
- ❌ Não há config por stage (stage/prod); tudo é `dev` por padrão. Falta CORS restrito (hoje `cors: true`).
- 🟡 SES sem domínio verificado: em produção o código de login só iria para o log (`EMAIL_MODE=console` é o padrão).
- 🟡 O segredo `/scorely/<stage>/auth-secret` precisa ser criado à mão no SSM antes do primeiro deploy.
- 🟡 Os módulos de domínio do scorely (grupos, partidas, lista de presença, sorteio de times) não existem.
- 🟡 `lib/` (http, dynamo, env) está duplicado entre projetos; o `db.ts` com helpers genéricos (`batchGetOrdered`, `queryLookupIds`) só existe no scorely.
- 🟡 Notificações sem página no front, só o sino.

### Perguntas para o dono do projeto

1. Qual é o escopo do MVP do scorely (grupos, partidas, lista de espera, sorteio misto)? Em que ordem?
2. Existe multi-tenant previsto (ex.: um subdomínio por grupo ou organização) ou cada projeto é um app único?
3. Vai haver usuários "platform" (admin) separados dos usuários do produto? Com quais papéis dentro de um grupo (dono, admin, jogador)?
4. Onde o front vai ser hospedado e quais domínios ou subdomínios serão usados?
5. Quais stages existirão (dev/stage/prod) e em quais contas AWS?
6. Quando entra o CI/CD (GitHub Actions?) e qual é o fluxo de branches (`main` vs `master`)?
7. Qual domínio vai ser verificado no SES para o envio real dos códigos?
8. O `base` continua só como template ou vira um produto?
