# Revisão: docs/plans/008-visual-placar.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- Contrato sem mudança: o diff não toca `apps/scorely/contracts` nem a api; as chamadas `groupsApi.create/update/removeMember` e o `safeParse` do Zod continuam iguais (`apps/scorely/web/src/modules/groups/pages/GroupCreatePage.vue:128`, `apps/scorely/web/src/modules/groups/components/LayersCard.vue:138`)
- web.md, Options API: os 4 componentes novos e `NotificationList.vue` usam `defineComponent` e `setup()` só para a store. Não há `<script setup>`, `useQuasar` nem `useRoute`
- web.md, erros: sempre `errorMessage(err)` / `issueMessage`, nunca `err.message`
- web.md, datas: só `formatDateTime`. O único `Intl.` (`apps/scorely/web/src/modules/users/pages/ProfilePage.vue:16`) já estava no HEAD
- code.md: nenhum `let`/`var`. O timer fica em `data` e é limpo no `beforeUnmount` (D9) (`apps/scorely/web/src/modules/groups/components/GameCard.vue:62-68`)
- D1/D2: `dark: true` e as fontes `@fontsource` (só os pesos usados) em `apps/scorely/web/src/main.ts`. O `sassVariables` está em `apps/scorely/web/vite.config.ts`
- D5/D6/D7/D8/D10: componentes em `apps/scorely/web/src/components/`, escada em `apps/scorely/web/src/modules/groups/layers.ts`, sheet no `xs` em `NotificationBell.vue`
- Permissões do dono iguais: `canCancel` e `v-if="isOwner && !m.isOwner"` com `:disable="busy"` (`GroupPage.vue`)

## ❌ Violou

- (nada)

## ⚠️ Precisa de você

- `biome.json` passou a ignorar `**/*.scss`, então `app.scss` fica sem lint. A decisão não está entre as D1–D14; só aparece na linha de Status do plano.
- Há chaves de i18n além das listadas na D12: `groups.layerNames`, `linkBadge`, `timeline`, `stepGame/stepLayers`, `lessHours/moreHours`, `yourBenchPlace`, `cancelledHint`, `inProgressHint`, `notifyWhenOpens`, `home.waiting`, `weekdaysLetter`, `back`, `removeMember`. Estão nos dois locales. Também ficou sem uso `home.noGroups` (`apps/scorely/web/src/i18n/locales/pt-BR.ts:101`).
- Comportamento além do plano: no criar grupo, as reservas continuam acompanhando a metade dos membros enquanto não são mexidas (vem do 007), agora por `changeLayer`. Os steppers usam o `max` de `listOpensHoursBefore` para todas as camadas (o `changeLayer` limita depois).
- `LayersCard.summary` usa `Date.now()` dentro do `computed`, que não é reativo. O estado "Em breve" só vira "Aberta" quando a tela renderiza de novo.

## Testes

| Caso           | Teste                                                    | Observação                     |
| -------------- | -------------------------------------------------------- | ------------------------------ |
| 1–4            | `apps/scorely/web/src/modules/groups/scoreboard.test.ts` | ok                             |
| 5–7            | `apps/scorely/web/src/modules/groups/layers.test.ts`     | ok                             |
| 8–10           | `apps/scorely/web/src/modules/groups/layers.test.ts`     | ok                             |
| 11–12          | `apps/scorely/web/src/modules/groups/layers.test.ts`     | ok                             |
| 13             | `checks/web.test.ts`                                     | ok, inclui a violação plantada |
| 14             | `apps/scorely/web/src/i18n/locales.test.ts`              | ok                             |
| Roteiro manual | —                                                        | o dono faz                     |

Os testes staged não mudaram depois do passo 3: `git diff` nos `*.test.ts` saiu vazio.

## npm run check

Verde: typecheck, test (web 115), lint (biome em 212 arquivos) e check:rules (38).
