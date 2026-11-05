# Revisão: docs/plans/005-perfil-idioma-fuso.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- Contrato conforme o plano: `LocaleSchema`, `TimeZoneSchema` canônico via `Intl`, campos opcionais em `User`/`UpdateMeInput` → `apps/scorely/contracts/src/users.ts:15`, `:28`, `:40-41`, `:51-52`; `RequestCodeInput.locale` → `apps/scorely/contracts/src/auth.ts:11`
- D6 email do código por idioma, padrão `pt-BR` → `apps/scorely/api/src/modules/auth/auth.service.ts:102`, `handlers.ts:28-29`, `login-code.email.ts`
- API: `PATCH /me` continua em `authHandlers` (`apps/scorely/api/src/modules/users/handlers.ts:9`); nenhum erro novo; sem dado pessoal em log; sem mudança de DynamoDB (o `update` genérico cobre, como diz a tarefa 2)
- Chaves de validação nos 2 locales → `apps/scorely/web/src/i18n/locales/pt-BR.ts:36-37`, `en.ts:27-28`
- Web em Options API; erros via `errorMessage` → `ProfilePage.vue:100`, `NotificationBell.vue:42`
- D5 helper único + sino usando o helper → `NotificationBell.vue:30`; check → `checks/web.test.ts:9`
- D3/D4 + `applyPreferences` no login/`loadMe`/`updateProfile`/logout → `apps/scorely/web/src/modules/auth/auth.store.ts:23,29,35,44`; antes do login → `main.ts:25`; `requestCode` manda o idioma → `auth.api.ts:9`
- D8 docs: ADR 0006 + índice, `web.md`, `scorely-api.md` e plano 003 (D7/D11) atualizados conforme D8

## ❌ Violou

(nenhuma)

## ⚠️ Precisa de você

- `ProfilePage.vue:63` e `:84`: qualquer salvamento do perfil também grava `locale` (o idioma atual, se o perfil ainda não tem), mesmo sem o usuário mexer no campo. O D4 só manda gravar o fuso junto com o nome no primeiro acesso; para o idioma, foi decisão não escrita no plano. Não é "salvamento silencioso" (só ao clicar em salvar).
- `contracts/src/users.ts:41`: `UserSchema` valida `timeZone` com o `Intl` de quem faz o parse. Se um navegador não reconhecer o fuso salvo (ICU diferente da api), o parse do `GET /me` falha inteiro. E o nome canônico pode não estar em `Intl.supportedValuesOf` (`ProfilePage.vue:15`, ex.: `Asia/Calcutta`/`Asia/Kolkata`). Risco baixo, mas registrado.
- Casos 12 (tela) e 13 verificados só manualmente, como o plano já registra; a troca de idioma na tela (caso 9 e 13) depende de `applyPreferences`, que não tem teste em Node.

## Testes

| Caso  | Teste                                                                        | Observação                                         |
| ----- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| 1-4   | `apps/scorely/api/src/modules/users/user.preferences.test.ts`                | 422 e "nada gravado" conferidos por `writes.count` |
| 5-6   | `apps/scorely/api/src/modules/auth/auth.service.test.ts` ("idioma do email") | ok                                                 |
| 7-9   | `apps/scorely/web/src/lib/preferences.test.ts`                               | só a lógica pura; a troca no i18n não é testada    |
| 10-11 | `apps/scorely/web/src/lib/datetime.test.ts`                                  | ok                                                 |
| 12    | `datetime.test.ts` (`detectTimeZone`) + `preferences.test.ts`                | lógica coberta; tela manual                        |
| 13    | —                                                                            | manual (previsto no plano)                         |
| 14    | `checks/web.test.ts`                                                         | inclui violação plantada                           |

Nenhum teste alterado depois de staged (`git diff` sem `--staged` vazio).

## npm run check

Verde (typecheck, test, lint, check:rules; exit 0).

---

## Nota da sessão principal

- As linhas citadas conferem com os arquivos (o ajuste do `reviewer` feito no plano 004 funcionou).
- Os 3 ⚠️ ficam com o dono; ver a entrega.
