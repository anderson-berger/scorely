# app-base

Monorepo com vários projetos web. Cada projeto tem **Vue 3 + Quasar** no front e **Serverless Framework v4 + Lambdas + DynamoDB (single-table)** no back, com validação em **Zod** nos dois lados.

## Estrutura

```
.devcontainer/              Dockerfile (node:24-bookworm-slim) + compose (app + LocalStack)
serverless-compose.ts       orquestra o deploy: infra de cada projeto → api, repassando outputs como params
infra/
  shared/                   definição da tabela (single-table.ts), stack de infra (infra-service.ts), setup-local
  <projeto>/                @<projeto>/infra — serverless.ts do stack `<projeto>-infra` (tabela + Outputs)
apps/<projeto>/
  api/                      @<projeto>/api — serverless.ts (tipado com @serverless/typescript), sem recursos
    project.ts              nome do projeto (service) e portas locais
    src/lib/                env (Zod), dynamo (DocumentClient), http (handler/erros + ApiErrorSchema)
    src/modules/<mod>/      functions.ts · schema · handlers · service · repository · testes
  web/                      @<projeto>/web — Vite + Quasar + Pinia + Vue Router
    src/lib/                http (axios + ApiErrorSchema)
    src/modules/<mod>/      routes · schema · api · store · pages
  contracts/                @<projeto>/contracts: schemas Zod + tipos da API, importados pela api e pela web (só no scorely)
```

| Projeto   | O que é                                             | web  | api  |
| --------- | --------------------------------------------------- | ---- | ---- |
| `base`    | template de referência (módulos `health` e `items`) | 5173 | 3000 |
| `scorely` | gerenciamento de grupos esportivos (pelada)         | 5174 | 3010 |

Cada api também usa as portas `+1` (websocket) e `+2` (lambda) do serverless-offline. Cada projeto reserva um bloco de 10 portas: 3000, 3010, 3020...

Tooling: npm workspaces (`apps/*/*`, `infra/*`) + Turborepo · TypeScript strict · Biome (lint + format) · Vitest.

## Rodando

1. Crie `.devcontainer/.env` com a sua access key pessoal do Serverless (veja [Serverless: access key](#serverless-access-key)):

   ```
   SERVERLESS_ACCESS_KEY=<sua-key>
   ```

2. Abra no VS Code → **Dev Containers: Reopen in Container** (roda `npm install`). Se o container já existia, use **Rebuild Container** para ele pegar a key.
3. `npm run dev:<projeto>` sobe a web e a api daquele projeto. Antes, o Turbo roda o `db:setup` do `@<projeto>/infra`, que cria a tabela no LocalStack.

| Comando                                            | O quê                                             |
| -------------------------------------------------- | ------------------------------------------------- |
| `npm run dev:base` / `npm run dev:scorely`         | web + api de um projeto (serverless offline)      |
| `npm run dev`                                      | todos os projetos ao mesmo tempo                  |
| `npm run typecheck` / `npm test` / `npm run build` | via Turbo, em todos os projetos                   |
| `npx turbo run test --filter='@scorely/*'`         | qualquer tarefa só em um projeto                  |
| `npm run lint` / `npm run format`                  | Biome                                             |
| `npm run db:setup`                                 | cria as tabelas `<projeto>-<stage>` no LocalStack |

## Infra e deploy (Serverless Compose)

Recursos com estado (tabelas e, no futuro, buckets e filas) ficam em `infra/<projeto>`, num stack próprio: `<projeto>-infra`. A api só tem lambdas e permissões. Ela recebe os dados da infra por parâmetro.

1. O `infra/<projeto>` expõe os dados como **CloudFormation Outputs** (`TableName`, `TableArn`).
2. O `serverless-compose.ts` da raiz liga os stacks: `params: { tableName: '${service:<projeto>-infra.TableName}' }`. A referência também define a ordem, então o infra sobe antes da api.
3. A api lê o valor com `${param:tableName, self:custom.localTableName}`.

| Comando (na raiz)                                               | O quê                                         |
| --------------------------------------------------------------- | --------------------------------------------- |
| `npx serverless deploy --stage <stage>`                         | todos os projetos (infra → api, em paralelo)  |
| `npx serverless deploy --service=base-infra,base-api --stage …` | só um projeto                                 |
| `npx serverless base-api deploy --stage …`                      | só a api (o infra já precisa estar deployado) |
| `npx serverless info` / `npx serverless print`                  | outputs/config resolvidos de todos            |

- **Rode o deploy pela raiz**, nunca de dentro de `apps/<projeto>/api`. Fora do compose o param não existe, então a api cai no fallback do dev local.
- **Dev local não usa o compose.** O compose lê os outputs do _Shared State_ na AWS e exigiria credenciais reais. O `serverless offline` roda dentro da api, e o fallback `custom.localTableName` aponta para a tabela que o `db:setup` criou no LocalStack.
- **Shared State**: no primeiro deploy, o compose cria um bucket S3 versionado na conta para guardar os outputs, e registra o nome dele no SSM, em `us-east-1`, no parâmetro `/serverless-framework/state/s3-bucket`. Quem faz o deploy precisa de permissão para isso.
- **`DeletionPolicy: Retain`** na tabela: `serverless remove` apaga o stack, mas mantém a tabela e os dados. Para remover um stage de vez, apague a tabela à mão.
- `serverless package` via compose exige que o infra já esteja deployado. O `npm run build` (Turbo) roda o package em cada pasta, fora do compose, então não depende disso.

## Serverless: access key

O Serverless v4 exige autenticação em todo comando, inclusive no `serverless offline`. A access key identifica **quem** roda (pessoa ou CI), e não o projeto. Uma key serve para o monorepo inteiro: as apis, os stacks de `infra/*` e o compose. Os projetos são separados pelo `service` de cada `serverless.ts`.

Gere a key em [app.serverless.com](https://app.serverless.com) → Settings → Access Keys.

| Onde               | De onde vem a key                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Local (container)  | `.devcontainer/.env` com a **key pessoal** de cada dev (ignorado pelo git)                       |
| CI/CD (stage/prod) | **Secret** do GitHub (`SERVERLESS_ACCESS_KEY`), de preferência por Environment (`stage`, `prod`) |

- **Local**: o `docker-compose.yml` lê o `.devcontainer/.env` sozinho e repassa a key para o container, e o Turbo a repassa para as tarefas (`globalPassThroughEnv`). O arquivo fica no workspace, então sobrevive a rebuilds. Alternativas: exportar `SERVERLESS_ACCESS_KEY` no shell do host, ou rodar `npx serverless login` no container. O login fica na home do container e se perde no rebuild. Rode o login **fora** do `npm run dev`, senão cada api abre o próprio prompt.
- **A key local não dá acesso à AWS.** No dev, as credenciais AWS são `test`/`test` do LocalStack, e a key só autoriza o Framework a rodar. Deploy acontece só pelo CI.
- **CI**: use uma key exclusiva do CI, criada na org, para poder revogá-la sem afetar ninguém. Guarde em **Secrets**, não em Variables, porque Variables aparecem em texto puro. No workflow:

  ```yaml
  env:
    SERVERLESS_ACCESS_KEY: ${{ secrets.SERVERLESS_ACCESS_KEY }}
  ```

## Novo projeto

1. Copie `apps/base` para `apps/<projeto>` (sem `node_modules`, `.turbo`, `dist`, `.serverless`) e apague os módulos de exemplo (`items`) que não fizerem sentido.
2. `api/package.json` e `web/package.json`: troque o nome para `@<projeto>/api` e `@<projeto>/web`. No api, troque também a dependência `@base/infra` por `@<projeto>/infra`.
3. Infra: copie `infra/base` para `infra/<projeto>`. Troque o nome no `package.json` (`@<projeto>/infra` e o argumento do `db:setup`) e no `createInfraService('<projeto>')` do `serverless.ts`. Depois, adicione `<projeto>-infra` e `<projeto>-api` no `serverless-compose.ts`.
4. `api/project.ts`: `name` e o próximo bloco livre de portas (ex.: `3020/3021/3022`).
5. `web/vite.config.ts` (`server.port`) e `web/src/lib/http.ts` (fallback da URL da api, com a porta `http` acima).
6. Título em `web/index.html` e em `web/src/layouts/MainLayout.vue`.
7. Raiz: script `dev:<projeto>` no `package.json`, portas em `.devcontainer/devcontainer.json` e a tabela acima.
8. Rode `npm install`.

## Novo módulo (dentro de um projeto)

1. Contrato: no scorely, `contracts/src/<mod>.ts`, exportado em `contracts/src/index.ts`. No base, `<mod>.schema.ts` na api e na web
2. `api/src/modules/<mod>/` (functions.ts, handlers, service, repository) → faça spread do `<mod>Functions` em `functions` no `serverless.ts`
3. `web/src/modules/<mod>/` (routes, api, store, pages) → registre as rotas em `src/app/router.ts`
4. Rota que exige login (scorely): `authorizer: { name: AUTHORIZER }` no evento `httpApi` do `functions.ts` + método em `authHandlers({...})` no `handlers.ts` (veja [scorely: login por código](#scorely-login-por-código-sem-cognito)).

**Handlers da api são métodos de um objeto**: `export const { list, get } = handlers({ async list() {...}, async get(event) {...} })`, ou `authHandlers({...})` para rotas com authorizer, cujos métodos recebem `(event, auth)`. Cada método devolve só os dados (200, ou 204 sem retorno) e falha lançando `appError(code)`, com um código do catálogo (`@scorely/contracts` → `ErrorCodeSchema`). O back só fala inglês, e o web traduz o erro pelo `code` via i18n (`apps/scorely/web/src/i18n/`). Fora dos handlers, função exportada é `export function`.

**Componentes Vue usam Options API**: `<script lang="ts">` com `defineComponent`, nunca `<script setup>`. O `setup()` serve só para expor as stores do Pinia (`return { auth: useAuthStore() }`). O resto vai nas opções (`data`, `computed`, `watch`, hooks e `methods`), com `this.$q`, `this.$route` e `this.$router`. Todo `computed` declara o tipo de retorno. Helper importado que o template usa vira método. Referência: `apps/scorely/web/src/modules/users/pages/ProfilePage.vue`.

> **Contrato só em contracts** (scorely): schemas Zod e tipos da API ficam em `apps/scorely/contracts` (`@scorely/contracts`, sem build: `exports` aponta para `src/index.ts`, única dependência `zod`). A api e a web importam de `@scorely/contracts` e não declaram schema de contrato próprio. Helpers de apresentação (`displayName`, `notificationIcon`) ficam no web. O `base` ainda duplica os schemas entre api e web, e o código de `lib/` continua duplicado entre projetos.

## DynamoDB (single-table)

Cada projeto tem a própria tabela, `<projeto>-<stage>`, só com `PK`/`SK` e **sem GSI**. A entidade fica em `PK=<ENTIDADE>#<id>`, `SK=META`. Toda busca por outro campo usa um **lookup**: um item ponteiro que guarda só o `id`. Primeiro você lê o lookup, depois busca a entidade pelo id.

- Busca única (ex.: user por email): `PK=LOOKUP#USER#EMAIL#<email>`, `SK=META`, `{ id }` → `GetItem` no lookup + `GetItem` no user
- Listagem (ex.: items por data): `PK=LOOKUP#ITEM`, `SK=<createdAt>#<id>`, `{ id }` → `Query` no lookup + `BatchGetItem` nos items

Entidade e lookups são gravados juntos numa `TransactWriteItems`. Use `attribute_not_exists(PK)` no lookup quando o valor tiver de ser único (ex.: email). Se o campo indexado mudar, apague o lookup antigo e crie o novo na mesma transação.

A tabela tem **TTL** no atributo `ttl` (epoch em segundos). O DynamoDB apaga o item com até ~48h de atraso, então quem lê também confere a validade (ex.: `expiresAt`).

## scorely: login por código (sem Cognito)

Fluxo: `POST /auth/code { email }` envia um código de 6 dígitos → `POST /auth/verify { email, code }` cria o usuário no primeiro acesso e devolve `accessToken` (JWT HS256, 1h) + `refreshToken` (30 dias, rotacionado a cada `POST /auth/refresh`) → `POST /auth/logout` encerra a sessão.

- **Rotas protegidas**: quem valida o access token é um **Lambda authorizer do HTTP API**. A rota se declara protegida no próprio `functions.ts` do módulo:

  ```ts
  import { AUTHORIZER } from '../../lib/auth';

  usersUpdateMe: {
    handler: handler('updateMe'),
    events: [{ httpApi: { method: 'PATCH', path: '/me', authorizer: { name: AUTHORIZER } } }],
  },
  ```

  No `handlers.ts`, cada rota protegida é um método do objeto passado a `authHandlers({...})` (`apps/scorely/api/src/lib/auth.ts`), que recebe `(event, auth)` com `auth = { userId, sessionId }`. Ele não valida token: só lê o contexto que o authorizer deixou em `event.requestContext.authorizer.lambda`. Se a rota esquecer o authorizer, o método responde 401 em vez de rodar sem usuário.
- **Authorizer**: a função `authAuthorizer` (`src/modules/auth/authorizer.ts`, que tem bundle próprio e enxuto) fica registrada em `provider.httpApi.authorizers` no `serverless.ts`. Ela é do tipo `request`, usa payload 2.0 e resposta simples, e roda **sem cache** (TTL 0), porque com cache um token expirado passaria até o fim do TTL. Respostas do Gateway, sem chamar a rota:

  | Situação                   | Status | Corpo                                        |
  | -------------------------- | ------ | -------------------------------------------- |
  | Sem header `Authorization` | 401    | resposta padrão do Gateway                   |
  | Token inválido ou expirado | 403    | resposta padrão do Gateway (sem `{ error }`) |

  O web (`apps/scorely/web/src/lib/http.ts`) renova a sessão no 401 **e** no 403 sem `{ error }`. Por isso, um 403 de regra de negócio deve sempre sair da api com o corpo `{ error }` (via `appError`), senão o web tenta renovar o token. O `serverless offline` executa o mesmo authorizer, então o dev local se comporta igual à AWS.
- **Limites**: reenvio a cada 60s, 5 códigos por hora por email, 5 tentativas por código (contadas de forma atômica antes de comparar), código vale 10 min e é de uso único. Reusar um refresh token já trocado derruba a sessão.
- **Segredo**: no `serverless offline` é um valor fixo de dev (`project.ts`); em qualquer outro comando vem do SSM. Crie antes do primeiro deploy de cada stage:

  ```sh
  aws ssm put-parameter --region sa-east-1 --type SecureString \
    --name /scorely/dev/auth-secret --value "$(openssl rand -base64 48)"
  ```

  A api recusa subir (500 em tudo) com o segredo de dev fora do offline.
- **Email**: `EMAIL_MODE=console` (padrão) só escreve o código no log, ou seja, no terminal do `dev:scorely` ou no CloudWatch. Para enviar de verdade: domínio verificado no SES em `sa-east-1`, conta fora do sandbox, e deploy com `EMAIL_MODE=ses EMAIL_FROM=no-reply@<domínio>`.

## Fluxo com IA (Claude Code)

Plano 002 (`docs/plans/002-fluxo-ia.md`). Índice das docs em [`docs/README.md`](docs/README.md).

| Peça                      | O quê                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`               | índice curto: mapa, fluxo, onde fica cada regra                                                             |
| `.claude/rules/<área>.md` | regras por área, com `paths:`; só carregam quando a IA toca arquivos da área                                |
| `/task <pedido>`          | plano → **você aprova** → contrato → testes (`test-writer`) → implementação → revisão (`reviewer`) → staged |
| `/rule <correção>`        | grava uma correção como check (`checks/`), decisão (`docs/decisions/`) ou regra de área                     |
| `npm run check`           | `typecheck` + `test` + `lint` + `check:rules` (os checks de arquitetura em `checks/`)                       |
| `.githooks/pre-commit`    | roda `npm run check` no **seu** commit; o devcontainer liga com `git config core.hooksPath .githooks`       |
| `.claude/settings.json`   | a IA não pode `git commit`/`git push` nem ler `.env`; `serverless deploy`/`remove` pedem confirmação        |

- **Quem commita é você.** A IA deixa tudo staged e sugere a mensagem.
- Clone fora do devcontainer: rode `git config core.hooksPath .githooks` uma vez. `git commit --no-verify` pula o hook (escolha sua).

## Pegadinhas

- **Biome x frontmatter**: o formatador de markdown do Biome quebra o frontmatter YAML (troca `*` por `_` nos globs). Por isso `.claude/**/*.md` fica fora do Biome (`biome.json` → `files.includes`).

- **Lockfile**: depois de mexer em dependências ou em workspaces, se aparecer "Cannot find native binding" (npm/cli#4828), apague o conteúdo de `node_modules` (no container é um volume, então a pasta em si não sai) e o `package-lock.json`, e rode `npm install`.
- **Variáveis de ambiente no Turbo**: o Turbo 2 só repassa para as tarefas as variáveis listadas em `turbo.json` (`globalPassThroughEnv` / `globalEnv`). Se criar uma variável nova, acrescente lá.
- **`serverless.ts`**: variáveis do Serverless (`${sls:stage}`, `${env:...}`) continuam como strings normais (aspas simples/duplas, nunca template literal). Um campo de tipo literal que receba variável precisa de cast.
- **TypeScript fixado em 6.x**: o vue-tsc/Volar ainda não suporta o TS 7 (nativo).
- **Porta 4566 ocupada** por outro LocalStack: `LOCALSTACK_PORT=4567` no host antes de subir o compose.
- **Região fixa `sa-east-1`** em tudo (serverless.ts, setup local, container, `.env.example`). Não depende do `AWS_REGION` do shell.
