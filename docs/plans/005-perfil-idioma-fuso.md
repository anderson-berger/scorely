# Plano 005: perfil, parte 1: idioma e fuso horário (scorely)

> Plano levantado em 2026-11-05 por leitura. Nada foi implementado.
> Decisões do dono (conversa de 2026-11-05): idioma escolhido e salvo no perfil; fuso salvo no perfil e **editável** (a detecção só sugere); back e contracts sempre em UTC; a hora do jogo é **mostrada no fuso do usuário**, mas a recorrência é guardada como hora local + fuso do grupo. Foto fica para o plano seguinte (opção B, S3 + URL assinada); telefone não entra.

## Objetivo

O usuário escolhe idioma (`pt-BR` | `en`) e fuso (IANA, ex.: `America/Sao_Paulo`) no perfil, e a web inteira passa a respeitar os dois: textos traduzidos e todas as datas no fuso do perfil. O email do código de login sai no idioma de quem pediu.

## Fora de escopo

- Foto de perfil (próximo plano).
- Notificações traduzidas na web (`type` + `params` no lugar de `title`/`body` em pt): tarefa separada. O título e o texto do `welcome` continuam em pt.
- Exibição de hora de jogo com a hora do grupo ao lado: o helper desta tarefa já aceita outro fuso, mas a tela é do plano 003. Aqui só se ajusta o texto do plano 003.
- Pacote de idioma do Quasar (textos internos de componentes, ex.: paginação): nenhum componente usado hoje mostra texto próprio.
- Mais idiomas além de `pt-BR` e `en`.

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                          | Por quê                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `locale` e `timeZone` **opcionais** no `User` e no `PATCH /me` (sem `null`: uma vez escolhidos, só trocam)                                                                                                                                                                       | usuários criados antes não têm os campos; não existe "voltar para automático"                                                      |
| D2  | `TimeZoneSchema` valida com `Intl.DateTimeFormat(undefined, { timeZone })` (nativo, sem dependência nova no contracts) e guarda o nome canônico (`resolvedOptions().timeZone`)                                                                                                   | mesmo critério na api e na web; aliases (ex.: `Brazil/East`) viram um nome só                                                      |
| D3  | **Idioma efetivo** na web = `user.locale` → último idioma usado neste navegador (`localStorage`, para a tela de login depois de sair) → idioma do navegador (`pt*` → `pt-BR`, resto → `en`)                                                                                      | o perfil manda; antes do login não há perfil                                                                                       |
| D4  | **Fuso efetivo** na web = `user.timeZone` → fuso detectado (`Intl…resolvedOptions().timeZone`). No primeiro acesso (tela de boas-vindas), o campo vem preenchido com o detectado e é salvo junto com o nome. Sem salvamento silencioso                                           | o dono quer o fuso editável; a detecção vem do relógio do sistema operacional (não do idioma do navegador), mas pode estar errada  |
| D5  | Toda data mostrada passa por **um helper**, `web/src/lib/datetime.ts` (`formatDateTime(iso, style, timeZone?)`), com `Intl.DateTimeFormat(idiomaEfetivo, { timeZone: fusoEfetivo })`. Check novo: nenhum `toLocale*String`/`Intl.DateTimeFormat` na web fora dele                | uma regra só para "data na tela"; o caso do `NotificationBell` (`'pt-BR'` fixo, fuso do navegador) não volta                       |
| D6  | `POST /auth/code` aceita `locale` opcional; a web manda o idioma efetivo. Sem `locale` → `pt-BR` (comportamento atual). Os textos do email ficam num template por idioma na api (`auth/login-code.email.ts`)                                                                     | o usuário pode ainda não existir: o idioma vem da requisição. É a exceção "email gerado no back", agora traduzida                  |
| D7  | Os textos da interface saem dos componentes para os locales (`pt-BR` e `en`): login, layout, home, perfil, sino                                                                                                                                                                  | hoje **nenhum** `.vue` usa `$t` (o i18n só cobre erros); sem isso, escolher `en` mudaria só erros e datas (ver pergunta 1)         |
| D8  | Regra registrada: ADR 0006 "Datas em UTC; exibição no fuso do perfil; recorrência em hora local + fuso do grupo" + linha no `web.md` + check do D5. No plano 003: D11 passa a "web formata no fuso do usuário" e o padrão do `timezone` do grupo (D7) passa a ser o fuso do dono | decisão do dono nesta conversa; o horário de verão exige a recorrência no fuso do grupo (UTC fixo deslocaria a hora local do jogo) |

## Contrato

| Onde                     | Mudança                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/src/users.ts` | `LocaleSchema = z.enum(['pt-BR', 'en'])`; `TimeZoneSchema` (D2, mensagem `Invalid time zone`)                                                      |
|                          | `UserSchema`: `locale: LocaleSchema.optional()`, `timeZone: TimeZoneSchema.optional()`                                                             |
|                          | `UpdateMeInputSchema`: `locale`, `timeZone` (parciais, sem `null`)                                                                                 |
| `contracts/src/auth.ts`  | `RequestCodeInputSchema`: `locale: LocaleSchema.optional()`                                                                                        |
| Rotas                    | nenhuma nova. `PATCH /me` e `GET /me` passam a ler/gravar os 2 campos; `POST /auth/code` aceita `locale`                                           |
| Erros                    | nenhum novo: fuso ou idioma inválido → 422 `VALIDATION_ERROR` (com `validation.timeZone.custom` e `validation.locale.invalid_value` nos 2 locales) |

## Interface da web (completada no passo 3, para os testes)

Lacuna apontada pelo `test-writer`: o plano não definia as funções de `preferences.ts` e `datetime.ts`. Todas são puras ou recebem as dependências por parâmetro, para dar para testar em Node (o web não tem ambiente de componente).

| Arquivo                      | Função                                                                                                                                           | Comportamento                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web/src/lib/preferences.ts` | `localeFromLanguages(languages: readonly string[]): Locale`                                                                                      | olha só o 1º idioma: começa com `pt` → `pt-BR`; qualquer outro (ou lista vazia) → `en`                                                                                                                                                                                               |
|                              | `effectiveLocale(input: { user?: Pick<User, 'locale'>; stored?: string \| null; languages: readonly string[] }): Locale`                         | D3: `user.locale` → `stored` (se for um `Locale` válido) → `localeFromLanguages(languages)`                                                                                                                                                                                          |
|                              | `effectiveTimeZone(input: { user?: Pick<User, 'timeZone'>; detected: string }): string`                                                          | D4: `user.timeZone` → `detected`                                                                                                                                                                                                                                                     |
|                              | `readStoredLocale(storage?: Pick<Storage, 'getItem'>): string \| null` e `storeLocale(locale: Locale, storage?: Pick<Storage, 'setItem'>): void` | chave `scorely.locale`; padrão `localStorage`; qualquer erro do storage é engolido (`null` / nada)                                                                                                                                                                                   |
| `web/src/lib/datetime.ts`    | `detectTimeZone(): string`                                                                                                                       | `Intl.DateTimeFormat().resolvedOptions().timeZone` (fica aqui porque o check do D5 só libera este arquivo)                                                                                                                                                                           |
|                              | `setDisplayTimeZone(timeZone: string): void`                                                                                                     | troca o fuso usado por padrão (estado reativo do Vue; começa com `detectTimeZone()`)                                                                                                                                                                                                 |
|                              | `formatDateTime(iso: string, style?: DateTimeStyle, opts?: { timeZone?: string; locale?: Locale }): string`                                      | `DateTimeStyle = 'dateTime' \| 'date' \| 'time'` (padrão `'dateTime'`). `'dateTime'` = dia e mês com 2 dígitos + hora:minuto; `'date'` = dia, mês e ano; `'time'` = hora:minuto. Sempre 24 h (`hourCycle: 'h23'`). Sem `opts`: idioma atual do i18n e o fuso do `setDisplayTimeZone` |

O auth store chama `applyPreferences(user?)` (em `preferences.ts`, não testado em Node: mexe no i18n, no `<html lang>` e no `datetime`) no login, no `loadMe`, no `updateProfile` e no logout (sem usuário).

Escopo do check (caso 14): só `apps/scorely/web`. O `apps/base/web` (`ItemsPage.vue` usa `toLocaleString`) fica fora, porque o 005 é do scorely.

## Casos de comportamento

| #   | Dado                                                               | Quando                                                  | Então                                                                                 |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | usuário logado                                                     | `PATCH /me { locale: 'en', timeZone: 'Europe/Lisbon' }` | 200 com os 2 campos; `GET /me` devolve os mesmos                                      |
| 2   | —                                                                  | `PATCH /me { timeZone: 'Mars/Olympus' }`                | 422 `VALIDATION_ERROR`; nada gravado                                                  |
| 3   | —                                                                  | `PATCH /me { locale: 'es' }`                            | 422 `VALIDATION_ERROR`                                                                |
| 4   | —                                                                  | `TimeZoneSchema.parse('Brazil/East')`                   | devolve o nome canônico (`America/Sao_Paulo`)                                         |
| 5   | —                                                                  | `POST /auth/code { email, locale: 'en' }`               | email com assunto e texto em inglês, com o código                                     |
| 6   | —                                                                  | `POST /auth/code { email }` (sem `locale`)              | email em português (igual a hoje)                                                     |
| 7   | web: navegador `['en-US']`, nada salvo, sem login                  | abre o login                                            | interface em inglês                                                                   |
| 8   | web: navegador `['pt-PT']`                                         | idem                                                    | `pt-BR`                                                                               |
| 9   | web: usuário com `locale: 'en'`, navegador em pt                   | login                                                   | interface muda para inglês; depois do logout, o login continua em inglês              |
| 10  | `formatDateTime('2026-11-06T22:00:00.000Z', …)`                    | fuso `America/Sao_Paulo` / `Europe/Lisbon`              | 19:00 / 22:00                                                                         |
| 11  | usuário com `timeZone: 'Asia/Tokyo'`, notificação de `…T22:00:00Z` | abre o sino                                             | mostra 07:00 do dia seguinte, no formato do idioma do perfil                          |
| 12  | primeiro acesso, sistema em `America/Manaus`                       | tela de boas-vindas                                     | campo de fuso já vem com `America/Manaus`; ao salvar, `timeZone` vai junto com o nome |
| 13  | perfil com idioma `pt-BR`                                          | troca para `en` e salva                                 | a tela muda para inglês na hora, sem recarregar                                       |
| 14  | qualquer `.vue`/`.ts` da web com `toLocaleString` fora do helper   | `npm run check`                                         | o check falha apontando o arquivo                                                     |

## Tarefas

| #   | Tarefa (≤ 1h)                                                                                                                                                                                                                                             | Pronto quando                                                             | Risco |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----- |
| 1   | Contrato (seção acima) + chaves de validação nos 2 locales                                                                                                                                                                                                | typecheck verde; casos 2–4 verdes                                         | Baixo |
| 2   | API: o `users` grava os campos (o `update` genérico do repository já cobre; só testes); `requestCode(email, locale?)` com templates `pt-BR`/`en`                                                                                                          | casos 1, 5 e 6 verdes                                                     | Baixo |
| 3   | Web: `lib/preferences.ts` (idioma e fuso efetivos, D3/D4; `localStorage` com try/catch); i18n troca o `locale` reativo e o `<html lang>`; o auth store aplica as preferências no login/`loadMe`/`updateProfile`; o `authApi.requestCode` manda o `locale` | casos 7–9 verdes                                                          | Médio |
| 4   | Web: `lib/datetime.ts` + o sino passa a usá-lo + check em `checks/web.test.ts`                                                                                                                                                                            | casos 10, 11 e 14 verdes                                                  | Baixo |
| 5   | Web: textos de login, layout e home para os locales                                                                                                                                                                                                       | nenhum texto fixo nesses 3; os 2 locales com as mesmas chaves (typecheck) | Médio |
| 6   | Web: textos do perfil e do sino para os locales; no perfil, seletor de idioma e de fuso (`q-select` com filtro sobre `Intl.supportedValuesOf('timeZone')`)                                                                                                | casos 12 e 13 verdes                                                      | Médio |
| 7   | Docs: ADR 0006 + índice; `web.md` (regra do D5); `scorely-api.md` (a exceção do email deixa de existir; a das notificações continua); plano 003 (D7 e D11)                                                                                                | conferido com a seção D8                                                  | Baixo |

## Perguntas

Nenhuma bloqueia. ✅ Aprovado pelo dono em 2026-11-05 com as recomendações.

| #   | Pergunta                                                               | Resposta   |
| --- | ---------------------------------------------------------------------- | ---------- |
| 1   | Traduzir todas as telas atuais (D7, tarefas 5 e 6) entra nesta tarefa? | ✅ Sim     |
| 2   | Email do código sem `locale`: `pt-BR` ou `en`?                         | ✅ `pt-BR` |

## Status

| Passo            | Estado                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado                                                                                                                                                                                                                                                         |
| 2. Contrato      | ✅ `LocaleSchema`, `TimeZoneSchema` (canônico), `User`/`UpdateMeInput` com os 2 campos, `RequestCodeInput.locale`; `Locale` do web passa a vir do contracts; chaves `validation.timeZone.custom` e `validation.locale.invalid_value` nos 2 locales; typecheck verde |
| 3. Testes        | ✅ `test-writer` em 2 rodadas (a 1ª apontou lacunas de interface do web; o plano ganhou a seção "Interface da web"): casos 1–12 (lógica) e 14; 12 (tela) e 13 manuais                                                                                               |
| 4. Implementação | ✅ tarefas 1–7; `npm run check` verde; testes staged intactos                                                                                                                                                                                                       |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`005-perfil-idioma-fuso.review.md`)                                                                                                                                                                                  |
| 6. Entrega       | ✅ tudo staged; commit é do dono                                                                                                                                                                                                                                    |
