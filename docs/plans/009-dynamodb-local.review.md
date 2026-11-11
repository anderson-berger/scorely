# Revisão: docs/plans/009-dynamodb-local.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D1 (desfazer o rascunho): `checks/localstack.test.ts` e `009-localstack-licenciada*` não existem; o staged do 008 (`checks/web.test.ts`, `biome.json`) não cita localstack/dynamo.
- D2: `.devcontainer/docker-compose.yml:28` `amazon/dynamodb-local:3.3.2`, `-sharedDb -dbPath ./data`, volume `dynamodb-data`; `user: root` previsto no risco da tarefa 2.
- D3: `aaronshaf/dynamodb-admin:5.3.4` com `DYNAMO_ENDPOINT`.
- D4: `app` → `http://dynamodb:8000`; fallback em `infra/shared/setup-local.ts:17` e `.env.example:2`; nome da variável mantido.
- D5: `.devcontainer/devcontainer.json`: 8000 `silent`, 8001 `notify`, sem 4566.
- D6 / caso 5: falha do TTL só avisa; mensagem de fora do ar cita DynamoDB Local e endpoint, sem LocalStack/token.
- D7: `docs/decisions/0007-dynamodb-local-sem-localstack.md` + índice.
- D8: comentários em `apps/{base,scorely}/api/src/lib/dynamo.ts`, `.claude/rules/infra.md:14`, README, PROJECT_CONTEXT.
- `code.md`: sem `let`/`var`. Contrato: nada mudou.

## ❌ Violou

- Nada.

## ⚠️ Precisa de você

- Trocas de texto fora da lista do D8: `CLAUDE.md:8` e `infra/shared/single-table.ts:3` (necessárias para o grep da tarefa 5). Confirme a do `CLAUDE.md`.
- Extras no README: dica de Rebuild Container e nota de TTL (só docs).
- `dynamodb-admin` ganhou `AWS_REGION` e credenciais `test` (fora do D3, inofensivo).
- O critério literal da tarefa 5 (`grep -ri localstack`) ainda acha a palavra em `checks/local-env.test.ts` e no título do 0007 no índice — ambos legítimos.
- Casos 1–5 só no roteiro manual: sem Docker no container. Ponto de mais risco: `user: root` + `working_dir` + `-dbPath ./data`.

## Testes

| Caso | Teste                                                                                            | Observação                    |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| 1–5  | roteiro manual                                                                                   | ambiente; não executados aqui |
| 6    | `checks/local-env.test.ts:97` (compose), `:100` (devcontainer), `:105–171` (violações plantadas) | staged e intacto              |

## npm run check

Verde (exit 0): typecheck + test 7/7, biome 216 arquivos, check:rules 6 arquivos / 46 testes.
