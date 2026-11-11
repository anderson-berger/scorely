# 014 — Tela de Grupos em abas com cards de capa

Pedido do dono (2026-11-09): a tela de Grupos (plano 013) ficou vazia e estreita no desktop. Das três direções do canvas (https://claude.ai/artifact/2BsZknN4PDjjyHzx6p5Zjo), o dono escolheu a **A · Capa** (card grande com foto de capa e logo), organizada em **3 abas**: **Próximos jogos**, **Meus grupos** e **Participo**.

## Objetivo

- A tela `/groups` ganha três abas:

  | Aba            | Conteúdo                                                             |
  | -------------- | -------------------------------------------------------------------- |
  | Próximos jogos | o jogo da semana de cada grupo, do mais próximo para o mais distante |
  | Meus grupos    | os grupos de que a pessoa é dona                                     |
  | Participo      | os grupos de que a pessoa participa sem ser dona                     |

- O card segue a opção A: área de capa no topo, logo sobreposto, nome, "esporte · dia hora", placar "confirmados:vagas" com legenda e uma frase sobre o estado.
- No desktop, os cards ficam em grade (até 3 colunas, página até 1080px). No celular, uma coluna.
- "+ Novo grupo" fica na linha do título.

Nada muda na api nem no contrato. **Logo e capa ainda não existem no grupo**: até lá, o card usa um **substituto** gerado do próprio grupo (cor + iniciais), e o upload fica para outro plano (pergunta 1).

## Fora de escopo

- Upload de logo e capa do grupo (api, contrato, S3, tela do dono). Vai para um plano próprio, que segue o caminho da foto de perfil (plano 010).
- Busca e filtro.
- O local do grupo: o plano `012-remover-local-do-grupo` tira o `location` do grupo. O card não usa local.

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Por quê                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Abas pela query** `?tab=next\|owned\|joined`, com `next` como padrão (sem query). Trocar de aba faz `router.replace` da query, então o voltar do navegador sai da tela em vez de voltar de aba. A aba vem de uma função pura, `groupsTab(query)`, e um valor desconhecido cai em `next`.                                                                                                                                                                                                                                                                                                                                                                                                       | `/groups/owned` colidiria com `/groups/:id`; com a query, o link de uma aba funciona sem mexer nas rotas. Trocar de aba aqui é filtro, não navegação |
| D2  | **Próximos jogos** mostra **todos** os grupos (meus e de que participo), ordenados por `game.startsAt` crescente, com os cancelados no fim. **Meus grupos** e **Participo** usam o `splitGroups` (plano 013) com a mesma ordenação. A ordenação é a função pura `sortByNextGame(groups)`, que é estável: no empate, mantém a ordem da api.                                                                                                                                                                                                                                                                                                                                                       | a aba padrão responde "qual é o meu próximo jogo?"; as outras organizam por papel                                                                    |
| D3  | **Contagem nas abas**: "Próximos jogos", "Meus grupos · 2", "Participo · 3". Próximos jogos não leva número.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | o número só ajuda onde a lista é de grupos                                                                                                           |
| D4  | **Frase do card**, da função pura `cardLine(group, now)`, nesta ordem:<br>1. jogo `cancelled` → "Cancelado esta semana" (tom de perigo)<br>2. `in_progress` → "Jogo em andamento"<br>3. estou na lista (`me.list === 'confirmed'`) → "Você joga · {position}º" (destaque)<br>4. estou na fila → "Você está na fila · {position}º"<br>5. a minha camada ainda não abriu → "Abre {date}"<br>6. sobra vaga → "Faltam {count} vagas"<br>7. senão → "Lista cheia · entrar na fila"<br>"Minha camada abre" = `startsAt − horas da camada`, com as horas vindas do grupo pelo `myRole` (`member` → `listOpensHoursBefore`, `reserve` → `reservesOpenHoursBefore`). A data aparece por `formatDateTime`. | a frase diz o que a pessoa precisa saber sem abrir o grupo. Tudo sai do `MyGroup` que a api já devolve                                               |
| D5  | **Substituto de logo e capa**: `groupColor(id)` escolhe, de forma determinística (hash do id), uma de 6 cores da paleta `--sc-group-1…6` (novos tokens em `app.scss`, com contraste ≥ 4.5:1 para as iniciais). O logo é um quadrado arredondado de 56px com as iniciais do nome (o `initials` que já existe), nessa cor. A capa é uma faixa de 120px com listras diagonais escuras e a cor do grupo numa borda de 4px embaixo. Quando o upload existir, a imagem entra no lugar sem mudar o card.                                                                                                                                                                                                | cada grupo fica reconhecível já agora, sem foto; sem gradiente decorativo                                                                            |
| D6  | **Componente `GroupCard`** em `modules/groups/components/`, usado pelas 3 abas. Ele recebe o `MyGroup` e o `now`. O chip de estado (`StatusChip`) fica sobre a capa, no canto superior direito.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | um card só, três listas                                                                                                                              |
| D7  | **Largura**: a tela de Grupos usa `.sc-page--wide` (`max-width: 1080px`). A grade é `repeat(auto-fill, minmax(300px, 1fr))` com 16px de espaço. As outras telas continuam com 480px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | resposta 1 do dono no plano anterior: a grade larga vale só aqui                                                                                     |
| D8  | **Título**: "Grupos" com o botão "+ Novo grupo" à direita. No celular (`xs`), o botão vira só "+" com `aria-label`. O botão grande do fim da tela sai. O estado vazio (nenhum grupo) continua como hoje, com o botão grande "Criar grupo" no meio, e as abas não aparecem. Uma aba sem grupos mostra uma linha: "Você ainda não é dono de nenhum grupo" ou "Você ainda não participa de grupos de outras pessoas".                                                                                                                                                                                                                                                                               | o botão fica perto do título; o estado vazio tem uma ação só                                                                                         |
| D9  | **Textos novos** em `pt-BR` e `en`: `groups.tabs.next` "Próximos jogos", `groups.tabs.owned` "Meus grupos", `groups.tabs.joined` "Participo", `groups.newGroup` "Novo grupo", `groups.scoreLegend` "confirmados · vagas", `groups.card.{cancelled,inProgress,playing,waiting,opens,spots,full}`, `groups.emptyOwned`, `groups.emptyJoined`. Saem `groups.owned` e `groups.joined` (os títulos das seções, que viram abas).                                                                                                                                                                                                                                                                       | regra de i18n                                                                                                                                        |

Notas da implementação (fora do plano, apontadas pelo reviewer):

- A tela atualiza o `now` dos cards a cada 60s, para a frase "Abre …" virar "Faltam … vagas" sem recarregar.
- `groups.card.spots` tem singular e plural ("Falta 1 vaga", "Faltam 2 vagas").
- O card de um jogo cancelado fica com borda tracejada e fundo transparente, como já era na lista do plano 013.

## Contrato

**Sem mudança.**

## Interface (para os testes)

```ts
// src/modules/groups/groups.ts (junto do splitGroups)
export type GroupsTab = 'next' | 'owned' | 'joined';
export function groupsTab(query: Record<string, unknown>): GroupsTab;
export function sortByNextGame<T extends { game: Pick<MyGroup['game'], 'startsAt' | 'status'> }>(
  groups: T[],
): T[];

export type CardLine =
  | { kind: 'cancelled' }
  | { kind: 'in_progress' }
  | { kind: 'playing'; position: number }
  | { kind: 'waiting'; position: number }
  | { kind: 'opens'; at: string } // ISO
  | { kind: 'spots'; count: number }
  | { kind: 'full' };
export function cardLine(
  group: Pick<MyGroup, 'myRole' | 'listOpensHoursBefore' | 'reservesOpenHoursBefore' | 'game'>,
  now: Date,
): CardLine;

export function groupColor(id: string): 1 | 2 | 3 | 4 | 5 | 6;
```

## Casos de comportamento

1. **Aba da query.** `groupsTab({})` → `next`; `{ tab: 'owned' }` → `owned`; `{ tab: 'joined' }` → `joined`; `{ tab: 'xyz' }` → `next`; `{ tab: ['owned'] }` → `next`.
2. **Ordem.** Jogos em sex, ter e qua → ter, qua, sex.
3. **Cancelado no fim.** Um cancelado na ter e um aberto na sex → sex, depois ter.
4. **Empate.** Dois grupos com o mesmo `startsAt` mantêm a ordem de entrada. A função não altera o array recebido.
5. **Frase: cancelado.** `status: 'cancelled'`, mesmo com `me` → `{ kind: 'cancelled' }`.
6. **Frase: em andamento.** `in_progress` → `{ kind: 'in_progress' }`.
7. **Frase: na lista.** `me: { list: 'confirmed', position: 3 }` → `{ kind: 'playing', position: 3 }`.
8. **Frase: na fila.** `me: { list: 'waitlist', position: 2 }` → `{ kind: 'waiting', position: 2 }`.
9. **Frase: ainda não abriu (membro).** `myRole: 'member'`, `listOpensHoursBefore: 48`, jogo daqui a 72h → `{ kind: 'opens', at: startsAt − 48h }`.
10. **Frase: ainda não abriu (reserva).** `myRole: 'reserve'`, `reservesOpenHoursBefore: 24`, `listOpensHoursBefore: 48`, jogo daqui a 30h (aberto para membros, fechado para reservas) → `{ kind: 'opens', at: startsAt − 24h }`.
11. **Frase: instante exato.** A camada abrindo exatamente em `now` conta como aberta: segue para vagas ou lista cheia.
12. **Frase: vagas.** Aberto, sem `me`, `confirmedCount: 6`, `slots: 8` → `{ kind: 'spots', count: 2 }`.
13. **Frase: cheia.** `confirmedCount` igual a `slots` → `{ kind: 'full' }`.
14. **Cor do grupo.** `groupColor` devolve 1–6, sempre o mesmo número para o mesmo id, e pelo menos 3 cores diferentes para 10 ids distintos.
15. **i18n.** As chaves novas existem em `pt-BR` e `en`; `groups.owned` e `groups.joined` não existem mais; `groups.card.playing` e `.waiting` usam `{position}`, `.opens` usa `{date}` e `.spots` usa `{count}`.

Roteiro manual (390px e 1840px):

- Sem query, a aba Próximos jogos fica ativa, com os jogos do mais próximo ao mais distante e os cancelados no fim.
- Meus grupos e Participo mostram as contagens. A URL muda para `?tab=owned` / `?tab=joined`, e o voltar sai da tela.
- Desktop: grade de 3 colunas, "+ Novo grupo" no título. Celular: uma coluna, "+" no título.
- Cada grupo tem cor e iniciais próprias e iguais em qualquer aba.
- Frases: um grupo cancelado, um em que estou na lista, um com a lista fechada ("Abre …") e um cheio.
- Nenhum grupo: estado vazio sem abas. Só grupos meus: Participo mostra a linha de vazio.

## Tarefas

| #   | Tarefa                                                                              | Pronto quando                             | Risco                         |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------- |
| 1   | `groupsTab`, `sortByNextGame`, `cardLine`, `groupColor` (casos 1–14)                | testes verdes                             | baixo                         |
| 2   | Tokens `--sc-group-1…6` e `.sc-page--wide` em `app.scss` (D5, D7)                   | contraste das iniciais ≥ 4.5:1            | baixo                         |
| 3   | `GroupCard` (D4–D6)                                                                 | card como o artboard "A · Capa" do canvas | médio: capa e logo sobreposto |
| 4   | `GroupsPage`: abas pela query (D1–D3), título com "+" (D8), grade (D7), vazios (D8) | roteiro manual                            | baixo                         |
| 5   | i18n (D9) e `npm run check`                                                         | check verde                               | baixo                         |

## Perguntas

1. **Upload de logo e capa** num plano separado (015), com esta tela já saindo com o substituto de cor e iniciais? Recomendo que sim: a tela fica pronta agora e as imagens entram depois sem mexer no card.
2. **Próximos jogos com todos os grupos (D2)**, ou só aqueles em que eu já confirmei ou ainda posso confirmar? Recomendo todos: o card já diz o estado de cada um, e o cancelado vai para o fim.
3. **Voltar do navegador sai da tela (D1)**, em vez de voltar para a aba anterior? Recomendo que sim, porque aqui a aba funciona como filtro. Na página do grupo (plano 012), as abas são navegação e o voltar volta de aba.

## Status

| Passo            | Estado                                                                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado (2026-11-09): upload de logo e capa em tarefa separada, Próximos jogos com todos os grupos, aba pela query sem histórico                                                                                                                                                     |
| 2. Contrato      | ✅ sem mudança; `npm run typecheck` verde                                                                                                                                                                                                                                                |
| 3. Testes        | ✅ `test-writer`: casos 1–14 (`groups.tabs.test.ts`), 15 (`locales.test.ts`; `groups.owned` e `groups.joined` saíram das expectativas do 013). Passaram de primeira porque a implementação foi escrita junto. Formatação do `locales.test.ts` corrigida com o biome (só quebra de linha) |
| 4. Implementação | ✅ tarefas 1–5; web 221, api 235, base 12, rules 56 verdes; `vite build` ok. Lint só falha em planos de outras tarefas (011, 012-remover-local, 013-membership)                                                                                                                          |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`014-tela-de-grupos-abas.review.md`)                                                                                                                                                                                                      |
| 6. Entrega       | ✅ tudo staged; commit com o dono                                                                                                                                                                                                                                                        |
