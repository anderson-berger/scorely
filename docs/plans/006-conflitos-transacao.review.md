# Revisão: docs/plans/006-conflitos-transacao.md

**Veredito:** aprovado com ressalvas (sem ❌)

## ✅ Respeitou

- D1/D5: um helper só (`createTransactWrite` em `lib/db.ts:164`, `transactWrite` em `:185`) e `isTransactionConflict` removido. Fora de `lib/db.ts` não sobrou `TransactWriteCommand`, `TransactionCanceledException` nem `isTransactionConflict`.
- Regras do `transactionFailure` (`lib/db.ts:144-160`): retry vence a condição; só `None`/`ConditionalCheckFailed` vira `condition`; o resto dá `undefined`.
- D2: até 3 envios, espera de (50 + rand·100) × tentativa; esgotou → relança o erro original (`lib/db.ts:178`).
- D4: índice 0 → `not_member`, outro → `stale` (`group.repository.ts:188`); laço de 3 tentativas com o grupo relido consistente (`group.service.ts:27-40`); `not_member` → `GROUP_MEMBER_NOT_FOUND`; esgotou → `Error` comum.
- Tarefa 2: todos os repositórios usam só `transactWrite` (`game.repository.ts:77,128,155`, `user.repository.ts:48`, `notification.repository.ts:51,92,110`, `group.repository.ts:97,156,175`). Itens das transações iguais aos de antes (entidade + lookups, `attribute_not_exists`, `dbItem` com o `createdAt` da entidade).
- Mensagens novas em inglês e sem dado pessoal. Sem `let`. Contrato e catálogo sem mudança.
- Tarefa 4: E1 "concluída" e E2 como próxima (`PRODUCT.md:20`, `:38`).

## ❌ Violou

(nada)

## ⚠️ Precisa de você

- Se o grupo some entre as tentativas de remoção, o service lança `GROUP_NOT_FOUND` (`group.service.ts:39`). O plano não define esse caso.
- `group.create`, `rotateInvite` e `notification.create` com condição falhando lançavam a `TransactionCanceledException` crua; agora lançam um `Error` próprio (`mustWrite`, `group.repository.ts:96-99`; `notification.repository.ts:68`). Continua 500.

## Testes

| Caso | Teste                        | Observação                                                         |
| ---- | ---------------------------- | ------------------------------------------------------------------ |
| 1–5  | `lib/db.test.ts:47-96`       | extras: vários índices, `ProvisionedThroughputExceeded`, só `None` |
| 6–10 | `lib/db.test.ts:102-165`     | confere a faixa da espera e o `attempts`                           |
| 11   | `groups.service.test.ts:827` | ninguém notificado                                                 |
| 12   | `groups.service.test.ts:836` | 2ª chamada com o token novo, uma promoção só                       |
| 13   | `groups.service.test.ts:859` | `Error`, não `AppError`, 3 chamadas                                |

Nenhum teste alterado depois de staged.

## npm run check

Verde: typecheck, test, lint (190 arquivos) e check:rules (32).
