# app-base

Monorepo com vários projetos web. Cada projeto tem **Vue 3 + Quasar** no front e **Serverless Framework v4 + Lambdas + DynamoDB (single-table)** no back, com validação em **Zod** nos dois lados.

| Projeto   | O que é                                             | web  | api  |
| --------- | --------------------------------------------------- | ---- | ---- |
| `base`    | template de referência (módulos `health` e `items`) | 5173 | 3000 |
| `scorely` | gerenciamento de grupos esportivos (pelada)         | 5174 | 3010 |

Cada projeto reserva um bloco de 10 portas (3000, 3010, 3020...). A api também usa as portas `+1` (websocket) e `+2` (lambda) do serverless-offline.

## Estrutura

```
.devcontainer/          container: app + DynamoDB Local + dynamodb-admin + S3Mock
serverless-compose.ts   deploy: infra de cada projeto → api
infra/shared/           tabela, stack de infra, setup local
infra/<projeto>/        stack `<projeto>-infra` (tabela, bucket de uploads e Outputs)
apps/<projeto>/
  api/                  lambdas: src/modules/<mod>/ (functions, handlers, service, repository, testes)
  web/                  Vite + Quasar + Pinia: src/modules/<mod>/ (routes, api, store, pages)
  contracts/            schemas Zod da API, usados pela api e pela web (só no scorely)
checks/                 regras de arquitetura verificadas por máquina
docs/                   negócio, produto e decisões (índice em docs/README.md)
```

Tooling: npm workspaces + Turborepo, TypeScript strict, Biome (lint e format) e Vitest.

## Rodando

1. Crie `.devcontainer/.env` com a sua access key do Serverless (veja [Access key](#access-key-do-serverless)):

   ```
   SERVERLESS_ACCESS_KEY=<sua-key>
   ```

2. No VS Code, rode **Dev Containers: Reopen in Container**, que também roda o `npm install`. Se o container já existia, use **Rebuild Container**.
3. Rode `npm run dev:<projeto>`. Ele cria a tabela no DynamoDB Local (no scorely, também o bucket no S3Mock) e sobe a web e a api.

| Comando                                    | O quê                                                      |
| ------------------------------------------ | ---------------------------------------------------------- |
| `npm run dev:base` / `npm run dev:scorely` | web + api de um projeto                                    |
| `npm run check`                            | typecheck + testes + lint + checks: **o "pronto" do repo** |
| `npx turbo run test --filter='@scorely/*'` | uma tarefa só em um projeto                                |
| `npm run format`                           | formata com o Biome                                        |
| `npm run db:setup`                         | cria as tabelas no DynamoDB Local                          |

Tabelas: http://localhost:8001 (dynamodb-admin). Uploads: http://localhost:9090.

## Deploy

Os recursos com estado (tabela, bucket) ficam no stack `<projeto>-infra`, e a api só tem lambdas e permissões ([ADR 0001](docs/decisions/0001-infra-separada-da-api.md)). O `serverless-compose.ts` passa os Outputs da infra para a api como params e sobe a infra antes.

| Comando (sempre na raiz)                                              | O quê                                     |
| --------------------------------------------------------------------- | ----------------------------------------- |
| `npx serverless deploy --stage <stage>`                               | todos os projetos                         |
| `npx serverless deploy --service=scorely-infra,scorely-api --stage …` | um projeto                                |
| `npx serverless scorely-api deploy --stage …`                         | só a api (a infra já precisa estar no ar) |

- **Nunca rode o deploy de dentro de `apps/<projeto>/api`.** Fora do compose, o param não existe, e a api cai na tabela do dev local.
- O dev local não usa o compose: o `serverless offline` roda direto na api.
- A tabela tem `DeletionPolicy: Retain`. O `serverless remove` mantém a tabela e os dados.
- Antes do primeiro deploy de cada stage do scorely, crie o segredo do login:

  ```sh
  aws ssm put-parameter --region sa-east-1 --type SecureString \
    --name /scorely/<stage>/auth-secret --value "$(openssl rand -base64 48)"
  ```

- O email do login sai no log por padrão (`EMAIL_MODE=console`). Para enviar de verdade, use `EMAIL_MODE=ses EMAIL_FROM=no-reply@<domínio>`, com o domínio verificado no SES em `sa-east-1`.

## Access key do Serverless

O Serverless v4 pede uma access key em todo comando, inclusive no offline. A key identifica quem roda, e uma só serve para o monorepo inteiro. Gere em [app.serverless.com](https://app.serverless.com) → Settings → Access Keys.

- **Local:** `.devcontainer/.env`, com a sua key pessoal (fora do git). Ela não dá acesso à AWS: no dev, as credenciais são `test`/`test`.
- **CI:** uma key só do CI, guardada como **Secret** do GitHub (`SERVERLESS_ACCESS_KEY`), nunca como Variable.

## Novo projeto

1. Copie `apps/base` para `apps/<projeto>` e `infra/base` para `infra/<projeto>` (sem `node_modules`, `.turbo`, `dist` e `.serverless`).
2. Troque os nomes: `@<projeto>/api`, `@<projeto>/web` e `@<projeto>/infra` nos `package.json`, e `createInfraService('<projeto>')`.
3. Acrescente os aliases `@<projeto>/api/*`, `@<projeto>/web/*` e `@<projeto>/infra/*` nos `paths` do `tsconfig.base.json`.
4. Portas: o próximo bloco livre em `api/project.ts`, `web/vite.config.ts`, `web/src/lib/http.ts` e `.devcontainer/devcontainer.json`.
5. Na raiz: `<projeto>-infra` e `<projeto>-api` no `serverless-compose.ts`, e o script `dev:<projeto>` no `package.json`. Depois, rode `npm install`.

## Como o código é escrito

As regras ficam em `.claude/rules/` e o `npm run check` cobra a maioria delas. As principais:

- **Api:** cada rota é uma `export async function` que responde por `route(event, ...)` ou `authRoute(event, async (auth) => ...)` e devolve só os dados. Erro esperado é `appError(code)`, com um código do catálogo. O back só fala inglês, e o web traduz pelo `code`.
- **Web:** Options API (`defineComponent`), nunca `<script setup>`. Todo texto passa pelo i18n.
- **Contratos (scorely):** só em `@scorely/contracts`. O `base` ainda mantém cópias idênticas na api e na web.
- **Código:** sem `let`/`var`. Imports só pelo alias do pacote (`@scorely/api/src/...`), nunca por `./` ou `../`.
- **DynamoDB:** uma tabela por projeto, sem GSI. As buscas usam lookups, e o TTL é sempre conferido pelo `expiresAt` (ADRs [0002](docs/decisions/0002-single-table-sem-gsi.md), [0004](docs/decisions/0004-ttl-com-expiresat.md) e [0009](docs/decisions/0009-entidade-de-relacao-chave-natural.md)).

O negócio de cada módulo (regras numeradas e o porquê) está em [`docs/modules/`](docs/modules/README.md).

## Fluxo com IA (Claude Code)

- `/task <pedido>`: a IA muda o doc do módulo e **para para você aprovar**. Depois vêm o contrato, os testes, a implementação e a revisão, e tudo fica staged.
- `/rule <correção>`: grava uma correção como check, ADR ou regra de área.
- **Quem commita é você.** A IA não pode rodar `git commit`/`git push` nem ler `.env`.
- O `.githooks/pre-commit` roda o `npm run check`. Fora do devcontainer, ligue o hook uma vez com `git config core.hooksPath .githooks`.

## Pegadinhas

- **"Cannot find native binding"** depois de mexer em dependências: apague o conteúdo de `node_modules` e o `package-lock.json`, e rode `npm install`.
- **Variável de ambiente nova:** acrescente no `turbo.json` (`globalPassThroughEnv`/`globalEnv`), senão o Turbo não repassa.
- **`serverless.ts`:** variáveis do Serverless (`${sls:stage}`) vão em string normal, nunca em template literal.
- **TypeScript fixado em 6.x:** o vue-tsc ainda não suporta o TS 7.
- **Mudou o `devcontainer.json` ou o compose?** Rode **Rebuild Container**.
- **Porta 8000, 8001 ou 9090 ocupada no host:** use `DYNAMODB_PORT`, `DYNAMODB_ADMIN_PORT` e `S3_PORT` antes de subir. Se mudar a do S3, ajuste também o `S3_PUBLIC_ENDPOINT`.
- **Biome e frontmatter:** o Biome estraga o YAML dos `.md`, então `.claude/**/*.md` fica fora dele.
- **Região fixa `sa-east-1`** em tudo, sem depender do `AWS_REGION` do shell.
