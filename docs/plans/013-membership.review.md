# Revisão: docs/plans/013-membership.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D1/D3: chaves `MEMBERSHIP#<g>#<u>`/`META` e `LOOKUP#GROUP#<g>#MEMBERSHIP` → `apps/scorely/api/src/modules/groups/membership.table.ts:28-42`. As funções `#MEMBER`/`#RESERVE` saíram de `group.table.ts`.
- D5, entrar: membership e os 2 lookups na mesma transação, todos com `attribute_not_exists(PK)`; `createdAt` passa por `dbItem` → `group.repository.ts:103-131`. Criar grupo usa o mesmo helper.
- D5, promoção: 1 Update com `#role = :reserve`, e condição falhada é ignorada (idempotente) → `group.repository.ts:176-195`.
- D5/D6, remover: condição `attribute_exists(PK) AND #role = :role`, os 2 lookups na mesma transação, e a releitura distingue `stale` de `not_member` → `group.repository.ts:329-342`. O service relê o papel → `group.service.ts:64-70`.
- D4: leituras consistentes. `roleOf` faz 1 Get; `listMembers` e `groupsOf` usam Query + `batchGetOrdered`; `stripKeys` é aplicado antes de devolver.
- D7/D9: `groupsOf` no "meus grupos"; ordem dono → membros → reservas, e por `createdAt` dentro de cada papel → `group.service.ts:102`, `:155-156`.
- Tarefa 4: ressalva em `.claude/rules/dynamodb.md:17`, ADR 0009 e linha em `docs/decisions/README.md`.
- Contrato: nada do plano mexe em `@scorely/contracts`, nem em rota, handler ou web.
- Caso 17: `grep` por `#MEMBER`/`#RESERVE` e pelas funções antigas em `apps/*/api/src` não achou nada.

## ❌ Violou

- (nenhuma violação com evidência)

## ⚠️ Precisa de você

- O repositório Dynamo não tem teste automático (P3, já aceito no plano). A tarefa 5 (roteiro manual no DynamoDB Local) não está marcada como feita. Chaves e condições só foram conferidas lendo o código.
- O stage estava misturado com outros planos (008, 010, 012, 014; o 009 unstaged). Só os arquivos deste plano foram staged. No `docs/decisions/README.md`, entrou só a linha do 0009.
- Numeração repetida em `docs/plans/`: `013-membership.md` e `013-menu-lateral.md` (e dois `012-*`).
- Comportamento herdado, fora do plano: se o mesmo usuário entra pelos links de reserva e de membro ao mesmo tempo e o Put da reserva chega primeiro, ele fica `reserve` sem erro (`group.repository.ts:258`).

## Testes

| Caso            | Teste                              | Observação                                          |
| --------------- | ---------------------------------- | --------------------------------------------------- |
| 1–7             | `groups.service.test.ts:1660-1753` | casos 4–6 conferem `createdAt`/`roleChangedAt`      |
| 8–10            | `:1754-1819`                       | o caso 10 usa ordem de entrada diferente da dos ids |
| 11–14           | `:1820-1880`                       | o caso 13 simula a promoção no meio da remoção      |
| 15–16           | `:1881+`                           | ok                                                  |
| 17              | sem teste                          | coberto pelo grep desta revisão                     |
| D5/D6 no Dynamo | sem teste                          | repositório em memória; o Dynamo fica para o P3     |

Nenhum `*.test.ts` foi alterado depois de entrar em staged.

## npm run check

Verde: typecheck, test, lint (249 arquivos) e check:rules (56 testes).
