# CLAUDE.md

Monorepo: Vue 3 + Quasar (web) e Serverless v4 + Lambda + DynamoDB single-table (api), Zod nos dois lados.

## Mapa

- `apps/<projeto>/{api,web,contracts}`: `base` (template) e `scorely` (grupos esportivos). Contratos só no scorely.
- `infra/shared/` (tabela, stack, DynamoDB Local) e `infra/<projeto>/` (stack `<projeto>-infra`).
- `serverless-compose.ts`: liga infra → api. `checks/`: regras verificadas por máquina.
- `docs/`: índice em `docs/README.md`. **`docs/modules/` é a fonte de verdade do negócio**: o que cada módulo faz, as regras numeradas e o porquê.

## Fluxo de trabalho

- Toda tarefa passa pelo `/task <pedido>`: mudança no doc do módulo (`docs/modules/`) → **para e espera aprovação** → contrato → testes (subagente `test-writer`) → implementação → revisão (subagente `reviewer`) → tudo staged + mensagem de commit sugerida. O andamento fica em `.claude/work/` (fora do git). `docs/plans/` é só histórico.
- **Quem commita é o dono.** Nunca rode `git commit`/`git push` (bloqueado em `.claude/settings.json`).
- Proponha antes de implementar: para pergunta de design ("tem como...?"), mande opções e recomendação e pare.
- Quando o dono corrigir algo, ofereça `/rule <correção>` para gravar a regra no lugar certo.

## Verificação

`npm run check` = `typecheck` + `test` + `lint` + `check:rules`. É o único comando de "pronto"; o `pre-commit` roda o mesmo.

## Regras

As regras de cada área ficam em `.claude/rules/` e carregam sozinhas ao tocar os arquivos da área:

| Arquivo          | Área                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `infra.md`       | recursos só no stack de infra, params com fallback, IAM por ARN montado   |
| `dynamodb.md`    | single-table sem GSI, lookups, transações, `createdAt`, TTL + `expiresAt` |
| `api.md`         | handlers como `export function` com `route`/`authRoute`, só os dados      |
| `scorely-api.md` | erros por código do catálogo, back em inglês, authorizer, notificações    |
| `contracts.md`   | contrato só em `@scorely/contracts`; no `base`, cópias idênticas          |
| `web.md`         | Vue em Options API, i18n e tradução de erros                              |
| `code.md`        | nunca `let`/`var`; imports só pelo alias do pacote (sem `./`/`../`)       |
| `modulos.md`     | ler o doc do módulo antes de mudar; regra muda primeiro no doc            |

O porquê de cada decisão estrutural está em `docs/decisions/`. Antes de propor mudar uma delas, leia o ADR.

## Sempre

- Deploy só pela raiz (`npx serverless deploy ...`), nunca de dentro de `apps/<projeto>/api`.
- Nunca leia `.env` nem `.devcontainer/.env` (só `.env.example`).
- Converse e escreva docs em pt-BR. Código do back (mensagens, logs, schemas) em inglês.
