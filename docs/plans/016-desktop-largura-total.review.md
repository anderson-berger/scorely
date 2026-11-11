# Revisão: docs/plans/016-desktop-largura-total.md

**Veredito:** aprovado com ressalvas

O diff da web está todo staged junto com os planos 008 a 015. Não dá para isolar só o 016 no git, então o reviewer conferiu o estado atual dos arquivos contra cada decisão.

## ✅ Respeitou

- D1 `.sc-page` como antes abaixo de 1024px; a partir de 1024px `max-width: none`, `margin: 0`, `padding: 24px 32px 40px` → `app.scss:44-55`
- D1 `--wide` e `--group` saíram: nenhum uso em `.vue`, `.ts` ou `.scss`
- D2 `.sc-page--form` com 704px → `app.scss:57-59`, usada no `ProfilePage.vue:160` e no `GroupCreatePage.vue:160`
- D3 grupos `minmax(300px)`, vagas `minmax(220px)`, membros `minmax(280px)`, ajustes `minmax(420px)`
- D4 jogo cancelado com até 640px, alinhado à esquerda → `GameCard.vue:437-439`
- Fora de escopo mantido: estado vazio de Grupos, Login, BottomSheet e estados de carregamento e erro continuam centralizados
- Contrato sem mudança; só CSS

## ❌ Violou

- Nenhuma.

## ⚠️ Precisa de você

- O comentário do `GroupMembersPage.vue` ainda dizia "duas colunas". **Corrigido.**
- `.game--split { margin: 0 }` no `GameCard.vue` sobrou sem efeito. **Removido.**
- Apareceu `docs/plans/016-arquivar-grupo.md`, de outra sessão, com o mesmo número 016. É ele que faz o lint falhar (formatação). Não é deste plano: decidir se renumera e formata, ou se fica fora do staged.

## Testes

| Caso                                | Teste  | Observação                                      |
| ----------------------------------- | ------ | ----------------------------------------------- |
| Roteiro manual (390, 1024 e 1840px) | nenhum | D5: só CSS, sem teste automático, como previsto |
| Testes alterados depois de staged   | nenhum | ok                                              |

## npm run check

typecheck verde; testes verdes (web 262, api 253, base 12); check:rules verde (56). O lint só falha em `docs/plans/016-arquivar-grupo.md`, de fora deste plano.
