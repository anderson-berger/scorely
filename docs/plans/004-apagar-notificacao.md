# Plano 004: apagar uma notificação própria (`DELETE /notifications/{id}`)

> Criado pelo `/task` em 2026-11-05. É a tarefa de exemplo que valida o fluxo do plano 002 (tarefa 11).

## Objetivo

O usuário logado apaga uma notificação dele. Ela some da lista, e o contador de não lidas diminui se ela não estava lida.

## Fora de escopo

Apagar várias de uma vez ou todas, desfazer, apagar a notificação de outro usuário (nem o dono do grupo), página de notificações.

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                                     | Por quê                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| D1  | O service lê a notificação (`get`), confere `userId` e passa a entidade inteira para `repo.remove(n)`                                                                                                                                                                                                       | o lookup da lista tem `SK=<createdAt>#<id>`: sem ler a entidade, não dá para montar a chave dele |
| D2  | `remove` é uma `TransactWriteItems`: `Delete` da entidade + `Delete` do lookup da lista + `ADD unread -1` no `INBOX` **só se** `n.readAt` não existe                                                                                                                                                        | regra de DynamoDB: entidade e lookups juntos; o contador muda na mesma transação                 |
| D3  | O `Delete` da entidade tem condição `userId = :userId` e mais `attribute_not_exists(readAt)` (estava não lida) ou `attribute_exists(readAt)` (estava lida). Se a condição falhar (alguém marcou como lida no meio), o service relê e tenta **uma** vez de novo. Se sumiu, responde `NOTIFICATION_NOT_FOUND` | o contador nunca é decrementado duas vezes (pelo `markRead` e pelo `remove`)                     |
| D4  | Notificação inexistente ou de outro usuário → `NOTIFICATION_NOT_FOUND` (404). Apagar de novo → 404                                                                                                                                                                                                          | mesmo comportamento do `markRead`; não revela se a notificação existe                            |
| D5  | Nenhum schema nem erro novo; IAM já tem `DeleteItem`                                                                                                                                                                                                                                                        | usa `NOTIFICATION_NOT_FOUND`, que já existe                                                      |

## Contrato

| Rota                         | Quem                | Resposta / erros                     |
| ---------------------------- | ------------------- | ------------------------------------ |
| `DELETE /notifications/{id}` | logado (authorizer) | 204 · `NOTIFICATION_NOT_FOUND` (404) |

Interface nova do repository (para o `test-writer` montar o repositório em memória): `remove(n: Notification): Promise<boolean>`, que devolve `false` quando a condição de D3 falha. O service ganha `remove(userId: string, id: string): Promise<void>`.

## Casos de comportamento

| #   | Dado / quando / então                                                                                                                                                | Nível                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | U tem uma notificação lida → U apaga → ela some da lista; `unreadCount` não muda                                                                                     | service                                        |
| 2   | U tem duas não lidas → U apaga uma → a lista tem 1 e `unreadCount` = 1                                                                                               | service                                        |
| 3   | A notificação é de V → U tenta apagar → `NOTIFICATION_NOT_FOUND` (404); a de V continua lá e o contador de V não muda                                                | service                                        |
| 4   | id que não existe → `NOTIFICATION_NOT_FOUND`                                                                                                                         | service                                        |
| 5   | U apaga a mesma notificação duas vezes → a 2ª dá `NOTIFICATION_NOT_FOUND`                                                                                            | service                                        |
| 6   | Corrida: entre o `get` e o `remove`, a notificação é marcada como lida (o 1º `remove` devolve `false`) → o service relê e apaga; `unreadCount` diminui só 1 no total | service (repo em memória que simula a corrida) |
| 7   | Web: clicar em apagar no sino tira o item da lista e atualiza o contador; erro aparece traduzido                                                                     | manual (sem teste de componente no web)        |

## Tarefas

| #   | Tarefa (≤ 1h)                                                                                                        | Pronto quando                                                | Risco |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----- |
| 1   | Contrato: nada novo; confirmar que `NOTIFICATION_NOT_FOUND` existe nos 2 locales                                     | `npm run typecheck` verde                                    | Baixo |
| 2   | `test-writer`: casos 1–6 em `notification.service.test.ts`                                                           | testes falham por falta de `remove`; staged                  | Baixo |
| 3   | `remove` no repository (D2, D3) e no service (D1, D3, D4)                                                            | casos 1–6 verdes                                             | Médio |
| 4   | Rota `notificationsRemove` (`DELETE /notifications/{id}`, authorizer) + método `remove` em `authHandlers`            | `npm run check` verde (o check de rota ↔ authHandlers cobre) | Baixo |
| 5   | Web: `remove` no `notifications.api.ts` e na store; botão de apagar em cada item do `NotificationBell` (Options API) | caso 7 no navegador                                          | Baixo |
| 6   | `reviewer`                                                                                                           | relatório sem ❌                                             | Baixo |

## Perguntas

Nenhuma bloqueia. ✅ Aprovado pelo dono em 2026-11-05 com as recomendações.

| #   | Pergunta                          | Resposta             |
| --- | --------------------------------- | -------------------- |
| 1   | Entra o botão no sino (tarefa 5)? | ✅ Sim               |
| 2   | Apagar pede confirmação?          | ✅ Não: apaga direto |

## Status

| Passo            | Estado                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado                                                                                           |
| 2. Contrato      | ✅ nada novo: `NOTIFICATION_NOT_FOUND` já está no enum, no `CATALOG` e nos 2 locales; typecheck verde |
| 3. Testes        | ✅ `test-writer`: casos 1–6 em `notification.service.test.ts`, staged; caso 7 manual                  |
| 4. Implementação | ✅ repository, service, rota e web; `npm run check` verde; testes staged intactos                     |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`004-apagar-notificacao.review.md`); ⚠️ 1 corrigido    |
| 6. Entrega       | ✅ tudo staged; commit é do dono                                                                      |
