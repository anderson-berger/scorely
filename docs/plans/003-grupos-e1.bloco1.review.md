# Revisão: docs/plans/003-grupos-e1.md (bloco 1)

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- Tarefa 1: a seção "Módulo Grupos" em `docs/product/PRODUCT.md` tem o resultado esperado, o vocabulário, as entregas E1–E6 (E1 em andamento) e o limite conhecido. O `docs/README.md` aponta para ela. Nenhum código mudou nesta tarefa.
- Tarefa 2, erros: os 9 códigos novos estão nos 4 lugares (enum, `CATALOG` com os status da tabela, details de `GAME_LIST_NOT_OPEN`, i18n em pt-BR e en). Nenhuma mensagem tem dado pessoal.
- Tarefa 2, notificações: `waitlist_promoted` e `game_cancelled` entraram no `NotificationTypeSchema`, cada um com ícone.
- Tarefa 2, `groups.ts`: `Group`, `CreateGroupInput`, `Member`, `Game` com 4 status, `MyGroup` e os enums. Vagas de 2 a 50 e antecedência de 1 a 144 h.
- D13: o `TimeZoneSchema` ficou só nos schemas de entrada; na leitura, o campo é `z.string()`. D7 usa o nome `timeZone`.
- D14: o `formatter` cai no fuso detectado quando não conhece o fuso pedido. A regra foi registrada em `web.md` e no ADR 0006.
- Tarefa 4: os exports seguem a interface do plano. As funções são puras, recebem `now` de fora, não trazem dependência nova e não usam `let`.
- Escopo: nada de E2–E6, nem service, rota ou tela.

## ❌ Violou

(nada)

## ⚠️ Precisa de você

- O contrato tem detalhes que o plano não definia: `Game.groupId`, `me = { list: 'confirmed'|'waitlist', position }` e o `MyGroup.game` com `confirmedCount`. Esses detalhes fecham o contrato que o bloco 2 vai usar.
- O plano mudou depois da aprovação: em D7 e no caso 9, o campo passou de `timezone` para `timeZone`.
- Mudou um teste staged: `zoned.test.ts:61` passou de `open` para `scheduled`. O dono aprovou em 2026-11-06, e a mudança está registrada na nota do bloco 1.

## Testes

| Caso      | Teste                                                   | Observação                                                                                                                                                                         |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 (datas) | `apps/scorely/api/src/lib/zoned.test.ts:23`             | quinta com antecedência de 48 h → `open`; quinta com 24 h → `scheduled`; sexta 20h → `in_progress`; sexta 22h01 → jogo da sexta seguinte. Os erros de service ficam para o bloco 2 |
| 9         | `zoned.test.ts:89`                                      | São Paulo e Lisboa com o mesmo `now`, troca de horário de Lisboa, hora que não existe, hora que existe duas vezes, Tóquio                                                          |
| 14        | `apps/scorely/api/src/lib/timezone.contract.test.ts:28` | os 4 schemas, com `Mars/Olympus` e `Brazil/East`                                                                                                                                   |
| 15        | `apps/scorely/web/src/lib/datetime.test.ts:64`          | fuso desconhecido por `setDisplayTimeZone` e por `opts.timeZone`                                                                                                                   |

## npm run check

Verde: typecheck, test (scorely api 86, scorely web 31, base api 12), lint e check:rules (32).
