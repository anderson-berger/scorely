# Revisão: docs/plans/003-grupos-e1.md (bloco 2)

**Veredito:** aprovado com ressalvas (sem ❌)

## ✅ Respeitou

- D8/D9: o grupo, o lookup do convite e os 2 lookups do dono como membro são gravados numa só transação, todos com `attribute_not_exists` (`group.repository.ts:97-124`). Na troca do convite: Delete do lookup antigo, Put do novo e Update do grupo com condição no token antigo (`group.repository.ts:60-80`).
- D12: remover um membro é uma transação só: apaga os 2 lookups de membro, troca o convite e, se houver, faz os 3 Deletes da presença (`group.repository.ts:164-181`). Com o jogo `in_progress`, a presença fica (`game.service.ts:198`).
- D2/D5: jogo e lookup da data na mesma transação, com condição. Presença e os 2 lookups dela também numa transação. Quando perde a corrida, relê consistente (`game.service.ts:54-61`).
- O `createdAt` vem do `newEntity`, os lookups usam o `createdAt` da entidade, todo Put passa pelo `dbItem` e toda leitura pelo `stripKeys`.
- Rotas: as 11 estão em `authHandlers`, todas com authorizer, e o `userId` vem de `auth.userId`. O spread está em `serverless.ts:127`.
- Erros: todos saem por `appError`, na ordem da Interface. Os 9 códigos estão no `CATALOG` e no i18n.
- D6: a promoção só avisa quem estava na fila. No cancelamento, o dono não é avisado.
- Não há `let`.

## ❌ Violou

(nada)

## ⚠️ Precisa de você

- A implementação foi escrita em paralelo com os testes (está na nota do bloco 2). Para compensar, sabotei 5 regras do código e cada sabotagem derrubou ao menos um teste.
- `getMany` fica num objeto separado, `dynamoUserDirectory` (`user.repository.ts:112-125`), e não no `UserRepository`.
- Há um arquivo de teste só, `groups.service.test.ts`, em vez dos dois previstos.
- O `isTransactionConflict` (`lib/db.ts:134`) trata qualquer `TransactionCanceledException` como "a condição falhou", inclusive conflito com outra transação. Efeitos:
  - `addAttendance` devolve `false` e o `confirm` responde 200 sem ter gravado a presença;
  - `addMember` engole o erro;
  - `ensureRecord` termina em 500.
- Duas remoções simultâneas do mesmo membro: a segunda responde 500 em vez de `GROUP_MEMBER_NOT_FOUND` (`group.repository.ts:172`).
- Cancelar um jogo que já está cancelado durante a janela de 3 h devolve o jogo igual, e não `GAME_CLOSED`. A Interface não define essa ordem.
- `queryLookupRows` e a opção `consistent` no `batchGetOrdered` são infraestrutura nova em `lib/db.ts`.

## Testes

Todos em `apps/scorely/api/src/modules/groups/groups.service.test.ts`: casos 1 (253-308), 2 (316-334), 3 api (341-374), 4 (382-442), corrida 6a (452-492), 5 (500-553), 6 (563-596), 7 (605-650), 8 (661-714), 10 (721-752), 11 (759-777), 12 (784), 13 (796). Nenhum teste foi alterado depois de staged.

## npm run check

Verde: 143 testes na api (57 em `groups.service.test.ts`), lint e check:rules (32).
