# Revisão: docs/plans/014-tela-de-grupos-abas.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D1: aba vem da query, valor desconhecido ou array cai em `next` → `apps/scorely/web/src/modules/groups/groups.ts:15-18`. Trocar de aba usa `router.replace` → `GroupsPage.vue:94-97`
- D2: a ordenação é estável, os cancelados vão para o fim e o array de entrada não é alterado → `groups.ts:21-32`. As abas Meus grupos e Participo usam o `splitGroups` com essa ordem → `GroupsPage.vue:54-56`
- D3: contagem só nas abas Meus grupos e Participo → `GroupsPage.vue:58-64`
- D4: a frase do card segue a ordem do plano, com `>=` no instante exato e as horas da camada vindas do `myRole` → `groups.ts:46-60`. A data passa por `formatDateTime` → `GroupCard.vue:59`
- D5: 6 tokens de cor → `app.scss:20-25`. São cores claras sob `--sc-on-accent` (#0d1015); pela estimativa do reviewer, todas passam de 4.5:1 (a mais baixa, #7aa2ff, dá cerca de 7.6:1). Capa de 120px com borda de 4px e logo de 56px → `GroupCard.vue:123-154`
- D6/D7: um `GroupCard` serve as 3 abas. O chip fica sobre a capa. `.sc-page--wide` com 1080px e grade `minmax(300px, 1fr)` com 16px de espaço
- D8: botão no título; no `xs` aparece só o "+", com `aria-label`. O estado vazio não mostra abas. Aba sem grupos mostra uma linha
- D9: as chaves novas estão em `pt-BR.ts` e `en.ts`. `groups.owned` e `groups.joined` saíram
- Web: Options API com `defineComponent` na ordem certa e `computed` tipados. O erro aparece por `errorMessage(err)`. Não há `let`/`var`
- Escopo: api e contrato não mudaram e o card não usa `location`

## ❌ Violou

- (nenhuma)

## ⚠️ Precisa de você

- Decisão fora do plano: um timer de 60s atualiza o `now` dos cards (`GroupsPage.vue:11-12,78-91`). **Anotado no plano.**
- Decisão fora do plano: `groups.card.spots` ganhou forma no singular ("Falta {count} vaga | Faltam {count} vagas"). **Anotado no plano.**
- Decisão fora do plano: card cancelado com borda tracejada e fundo transparente (`GroupCard.vue:80,116-120`). **Anotado no plano.**
- O staged mistura outros planos (008, 010, 012-abas, 013-menu), e há mudanças fora do staged em `ProfilePage.vue`, infra e devcontainer. O commit sugerido precisa separar o que é de cada plano.

## Testes

| Caso  | Teste                                                           | Observação                                     |
| ----- | --------------------------------------------------------------- | ---------------------------------------------- |
| 1     | `apps/scorely/web/src/modules/groups/groups.tabs.test.ts:36-50` | inclui o array                                 |
| 2–4   | `groups.tabs.test.ts:57-77`                                     | empate e imutabilidade                         |
| 5–8   | `groups.tabs.test.ts:81-99`                                     |                                                |
| 9–10  | `groups.tabs.test.ts:101-122`                                   |                                                |
| 11    | `groups.tabs.test.ts:124-140`                                   | membro e reserva                               |
| 12–13 | `groups.tabs.test.ts:142-150`                                   |                                                |
| 14    | `groups.tabs.test.ts:153-182`                                   |                                                |
| 15    | `apps/scorely/web/src/i18n/locales.test.ts:163-208`             | as saídas do 013 foram tiradas, como o D9 pede |

Nenhum `*.test.ts` mudou depois de ir para o staged.

## npm run check

Vermelho só no lint, em 3 planos de outras tarefas, todos não rastreados: `011-modelador-de-dados.md`, `012-remover-local-do-grupo.md` e `013-membership.md`. O resto passou: typecheck verde; testes web 221, api 235 e base 12. O `check:rules` rodou à parte e deu verde (56). Nada disso vem do plano 014.
