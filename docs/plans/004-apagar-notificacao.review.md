# Revisão: docs/plans/004-apagar-notificacao.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D2 / dynamodb.md (entidade e lookups apagados na mesma transação) → `notification.repository.ts`: uma `TransactWriteCommand` com `Delete` da entidade, `Delete` do lookup `notificationListLookupKey(n)` e `inboxDelta(-1)` só se `!n.readAt`
- D3 (condição no Delete) → `notification.repository.ts`: `attribute_exists(PK) AND userId = :userId AND attribute_(not_)exists(readAt)`; `TransactionCanceledException` vira `false`
- D1/D4 (lê, confere dono, 404 do catálogo) → `notification.service.ts` `appError('NOTIFICATION_NOT_FOUND')`; código existe no `CATALOG` (`lib/errors.ts:28`), `pt-BR.ts:22`, `en.ts:18`
- D3 (uma releitura) → `notification.service.ts` (`REMOVE_ATTEMPTS = 2`, recursão, sem `let`)
- D5 (nada novo em schema/erro/IAM) → nenhum arquivo de contracts no diff; `dynamodb:DeleteItem` já em `serverless.ts:64`
- api.md / scorely-api.md (rota com login) → `functions.ts` com `authorizer: { name: AUTHORIZER }`; `handlers.ts` em `authHandlers`, usa `auth.userId` e `pathParam`; retorna `undefined` → 204
- web.md → `NotificationBell.vue` em Options API (método em `methods`), erro via `errorMessage(err)`, sem `err.message`; store/api em `notifications.store.ts` e `notifications.api.ts`
- Escopo → nada além das tarefas 1–5; botão no sino e sem confirmação, conforme as respostas das perguntas 1 e 2
- Mensagens do back em inglês; nenhum dado pessoal em mensagem/log

## ❌ Violou

(nenhuma)

## ⚠️ Precisa de você

- `notification.service.ts`: se a 2ª tentativa também falhar, cai em `throw new Error(...)` → 500. Isso inclui o caso em que a notificação foi apagada entre o 2º `get` e o 2º `remove`, e o D3 pede `NOTIFICATION_NOT_FOUND` quando "sumiu". Raro; o plano não especifica o que fazer quando a releitura também falha. Decida se 500 (bug/infra pela regra) é aceitável ou se deve virar 404.
- `NotificationBell.vue`: `aria-label="Apagar notificação"` fixo em pt-BR, sem `this.$t`. Segue o padrão já existente no componente, então não é violação; fica a pergunta se os textos do sino deveriam ir para o i18n (fora deste plano).
- Caso 7 (web) depende de teste manual no navegador; não verificado nesta revisão.

## Testes

| Caso | Teste                                     | Observação                                                                   |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| 1    | `notification.service.test.ts` (`caso 1`) | lida apagada, unreadCount continua 1                                         |
| 2    | `caso 2`                                  |                                                                              |
| 3    | `caso 3`                                  | confere 404 e que a de V e o contador de V ficam intactos                    |
| 4    | `caso 4`                                  |                                                                              |
| 5    | `caso 5`                                  |                                                                              |
| 6    | `caso 6`                                  | corrida via `beforeRemove`; confere `removeCalls = 2` e contador caindo só 1 |
| 7    | manual                                    | sem teste de componente no web, como o plano previa                          |

`git diff` (unstaged) vazio: testes staged não foram alterados depois.

## npm run check

Verde: typecheck, test, lint (biome, 152 arquivos) e check:rules (4 arquivos, 27 testes).

---

## Nota da sessão principal (depois da revisão)

- **⚠️ 1 resolvido:** era desvio do D3. Agora, esgotadas as tentativas, o service relê: se sumiu (ou não é do usuário) → `NOTIFICATION_NOT_FOUND`; só se ainda existe e mudou de novo → 500. Testes staged intactos; `npm run check` verde (scorely api 52 testes).
- **Ajuste no `reviewer`:** o relatório original citava linhas do diff (ex.: `notification.service.ts:332` num arquivo de 61 linhas). Removi esses números deste registro e o `.claude/agents/reviewer.md` passou a exigir a linha no arquivo atual.
- ⚠️ 2 (textos do sino fora do i18n) e ⚠️ 3 (caso 7 manual) ficam com o dono.
