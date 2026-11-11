# Revisão: docs/plans/012-abas-do-grupo.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D1 rotas filhas, e `group` continua sendo o Jogo → `apps/scorely/web/src/modules/groups/routes.ts:6-14`
- D2 o casco carrega uma vez e as ações ficam nele; as abas só emitem eventos → `pages/GroupPage.vue:79-95, 203-219`; o `router-view` não tem `key`, então trocar de aba não recarrega
- D3 `q-tabs`/`q-route-tab` presas no topo, com `groupTabs` → `GroupPage.vue:190-201, 271-279`; `tabs.ts:5`
- D4 redirect com `tabRedirect`, rodado no load e no watch de `$route.name` → `GroupPage.vue:70, 98-102`; `tabs.ts:10`
- D5 `nextLayer` (`<= now` conta como aberto; cancelled/in_progress/membros fechados → nada) → `layers.ts:80-91`; a linha fica abaixo do bloco de confirmar em `GameCard.vue:182`
- D6 o "Cancelar jogo" saiu do GameCard (`GameCard.vue:16`) e foi para o Ajustes, com o mesmo `canCancel` e o mesmo diálogo → `GroupSettingsPage.vue:37-47`; `GroupPage.vue:54, 141-146`
- D7 "Convidar" com BottomSheet; `manage=false` esconde "Gerar outro link" e o link do jogo → `GroupMembersPage.vue:47-56, 80-83`; `GroupLinksCard.vue:24, 48, 90, 104`
- D8 cabeçalho enxuto; fuso por `showGroupTimeZone`; selo do dono removido → `GroupPage.vue:180-188`; `tabs.ts:15`
- D9 chaves novas em pt-BR e en; `roster` = "Membros do grupo" / "Group members"; `youAreOwner` sem uso → `pt-BR.ts:212, 240-248`; `en.ts:202, 230-238`
- Web: Options API em todas as páginas novas, erros por `errorMessage` (`GroupPage.vue:93, 126`), nenhum `err.message`, `let` ou `<script setup>`
- Contrato e api: nenhum arquivo de 012 mexe neles

## ❌ Violou

- (nenhuma violação encontrada)

## ⚠️ Precisa de você

- O staged tem trabalho de outros planos ainda não commitados: 008 (visual Placar) e 010 (foto de perfil, com api, infra e contracts). GameCard, LayersCard, GroupLinksCard e `layers.ts` têm diffs de 008 e 012 juntos, e não dá para isolar o que é só do 012. Um commit agora mistura entregas. Decida se separa.
- Há arquivos não staged fora do 012: `ProfilePage.vue` (MM), `010-foto-de-perfil.md`, `0008-s3-local-s3mock.md`, `dynamo.ts` (base e scorely), `infra/shared`, `.devcontainer`, `CLAUDE.md` e outros. Nenhum é teste do 012.
- `layers.test.ts` repete os números de caso: "caso 5–12" aparecem para o plano 008 (linhas 14-132) e para o 012 (linhas 142-202). Não é erro, mas confunde na rastreabilidade.

## Testes

| Caso | Teste                                                   | Observação                                 |
| ---- | ------------------------------------------------------- | ------------------------------------------ |
| 1–2  | `modules/groups/tabs.test.ts:5, 9`                      | ok                                         |
| 3    | `tabs.test.ts:15, 19, 23`                               | ok, as 4 combinações                       |
| 4    | `tabs.test.ts:30, 34`                                   | ok                                         |
| 5–8  | `modules/groups/layers.test.ts:142, 147, 152, 157, 162` | ok                                         |
| 9–10 | `layers.test.ts:167, 177, 187`                          | ok                                         |
| 11   | `layers.test.ts:197, 202`                               | ok, reservas e convidados                  |
| 12   | `modules/groups/routes.test.ts:16-39`                   | ok, `createRouter` + `createMemoryHistory` |
| 13   | `src/i18n/locales.test.ts:111` (+ paridade de chaves)   | ok                                         |

Nenhum `*.test.ts` foi alterado depois de staged (`git diff` não lista testes).

## npm run check

Vermelho, mas a falha não vem do 012. typecheck verde; testes verdes (api 235, base 12, web 151). `lint` falha só na formatação de `docs/plans/011-modelador-de-dados.md` (não rastreado, linhas 89-92: `*...*` em vez de `_..._`). Como o lint falhou antes, `check:rules` não chegou a rodar nesta execução. O plano registra 56 testes verdes, mas isso não foi confirmado aqui.
