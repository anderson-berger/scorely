# Revisão: docs/plans/015-pagina-do-grupo-capa.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D8 `formatCountdown` (casos 1–3) → `apps/scorely/web/src/modules/groups/scoreboard.ts:52`
- D11 `memberSections` (dono primeiro, sem mutar) → `apps/scorely/web/src/modules/groups/groups.ts:72`
- D5 estilo `weekday` no único formatador → `apps/scorely/web/src/lib/datetime.ts:9` e `:15`
- D1 hero com cor e iniciais do `GroupCard`, 112/150px, logo 68/88px → `GroupHero.vue:27`, `:72`
- D3 caminho "Grupos / nome" só a partir de 1024px → `GroupPage.vue:170`
- D4 `.sc-page--group` com 960px → `app.scss:55`
- D6/D7 placar sempre visível e uma área de ação por estado, sem botão desativado → `GameCard.vue:129-179`
- D9/D10 Escalação e Banco condicionais e grade `5fr 7fr` → `GameCard.vue:183`, `:396`
- D11 seções, reservas tracejadas e ocultas quando vazias → `GroupMembersPage.vue:43-57`, `:143`
- D12 quatro seções na ordem, Zona de perigo só com `canCancel` → `GroupSettingsPage.vue:43-68`; links compactos com `aria-label` e "Gerar link" → `GroupLinksCard.vue:76`, `:84`
- Web: Options API em todos os componentes novos e alterados; erros por `errorMessage`; sem `err.message`
- D13: chaves novas em pt-BR e en; `ScoreBoard.vue` removido sem referências restantes
- Escopo: nada no contrato nem na api vindo deste plano; o `GameCard` continua servindo a `PlayPage`

## ❌ Violou

- (nada)

## ⚠️ Precisa de você

- D5: o título saía "Sexta-feira, 13/11, 19:00", sem o "·" antes da hora. **Corrigido** depois da revisão: estilo `dayMonth` no formatador, e o título fica "Sexta-feira, 13/11 · 19:00". O exemplo do plano ("Sexta") não bate com `weekday: 'long'` ("sexta-feira"); vale o nome completo.
- D1/D2: as abas ficaram fora do hero, no `GroupPage`, para continuarem presas no topo. **Anotado no plano.**
- A aba "Membros · N" conta todos os participantes (membros e reservas), e a seção "Membros · N" conta só os membros. **Anotado no plano** como decisão: a aba conta a gente toda da aba.
- `groups.lineup`, `bench`, `youPlay` e `yourPlace` ficaram sem uso, porque os testes do plano 008 ainda as exigem. Decidir se tira as chaves e os testes.
- Há mudanças fora do staged que não são deste plano (dynamo.ts da api, infra/shared, .devcontainer, CLAUDE.md, ADR 0008, plano 010). O staged junta os planos 008–014 ainda sem commit.

## Testes

| Caso                       | Teste                                      | Observação                             |
| -------------------------- | ------------------------------------------ | -------------------------------------- |
| 1–3                        | `modules/groups/scoreboard.test.ts:84-102` | ok                                     |
| 4–7                        | `modules/groups/groups.test.ts:31-55`      | ok                                     |
| 8                          | `lib/datetime.test.ts:102-112`             | ok                                     |
| 9                          | `i18n/locales.test.ts:201-279`             | ok; listas do 008 ajustadas no passo 3 |
| Testes alterados no staged | nenhum `*.test.ts` em `git diff`           | ok                                     |

## npm run check

Verde: web 256 testes, base 12, lint ok, check:rules 56.

---

# Revisão do ajuste do espaço vazio no desktop (D14–D19, casos 10–17)

**Veredito:** aprovado com ressalvas (o ❌ foi corrigido depois)

## ✅ Respeitou

- D14 `lineupSlots` como na interface, até 12 livres e o resto em `hiddenFree` → `scoreboard.ts:58-69`; Escalação sempre visível (some com o jogo cancelado), vagas livres com "vaga" e avatar tracejado, "+ N" pluralizado → `GameCard.vue:203-228`; Banco só com fila → `GameCard.vue:230`
- D15 `layerTimeline` na ordem membros/reservas/convidados, `<=` no instante exato → `layers.ts:166-181`; seção "Abertura da lista" abaixo do bloco, escondida com o jogo cancelado → `GameCard.vue:200`, `LayersTimeline.vue:26-48`; o `LayersCard` usa a mesma função → `LayersCard.vue:58`
- D16 duas colunas a partir de 1024px só fora do cancelado, Escalação em 2 colunas → `GameCard.vue:138`, `:441-452`
- D17 página até 1200px → `app.scss:55-57`, usada em `GroupPage.vue:163`
- D18 trilho fixo de 64px, `mini-to-overlay`, recolhe ao escolher um item ou no ☰; não sobra nada de `localStorage`/`RailExpanded` → `MainLayout.vue:28-71`, `:122-131`, `nav.ts:1-6`
- Web: Options API em todos os componentes tocados; i18n `freeSlot`/`moreFreeSlots` em pt-BR e en
- Escopo: contrato sem mudança, api não foi tocada por este ajuste

## ❌ Violou

- D19 (rótulos de 18px no desktop): o `font-size` ia na raiz do `q-route-tab`, mas o Quasar define o tamanho no filho `.q-tab__label` (14px padrão). **Corrigido:** o tamanho agora vai em `:deep(.q-tab__label)`, nas abas do grupo e também nas da tela de Grupos (plano 014), que tinham o mesmo problema.

## ⚠️ Precisa de você

- D19 "32px entre eles": o `margin-right: 32px` somava com o padding de 16px de cada aba. **Corrigido:** o margin saiu; o padding das abas já dá cerca de 32px.
- O roteiro manual não acompanhava o ajuste ("sem escalação", "960px"). **Corrigido** no plano.
- O comentário do `GameCard` ainda descrevia D10. **Corrigido.**
- O plano 013 não dizia que a preferência salva saiu. **Nota adicionada** no 013.
- O `LayersCard` redeclarava `LayerKey`/`LayerState`. **Corrigido:** importa de `layers.ts`.

## Testes

| Caso | Teste                                      | Observação                           |
| ---- | ------------------------------------------ | ------------------------------------ |
| 10   | `scoreboard.test.ts:111`                   | ok                                   |
| 11   | `scoreboard.test.ts:118`                   | ok                                   |
| 12   | `scoreboard.test.ts:130`                   | ok                                   |
| 13   | `scoreboard.test.ts:138`, `:145`           | lista cheia e mais pessoas que vagas |
| 14   | `layers.test.ts:221`, `:230`               | ok                                   |
| 15   | `layers.test.ts:239`                       | ok                                   |
| 16   | `layouts/nav.test.ts:19`                   | o caso 8 do plano 013 foi removido   |
| 17   | `i18n/locales.test.ts:284`, `:295`, `:301` | ok                                   |

## npm run check

Verde: typecheck, test, lint e check:rules (56).
