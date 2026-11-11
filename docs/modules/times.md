# Módulo Times

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Se o código e este doc discordarem, um dos dois está errado. Conferido com o código em 2026-11-11.

Código: `apps/scorely/api/src/modules/teams/`, `apps/scorely/web/src/modules/teams/`. Contrato: `apps/scorely/contracts/src/teams.ts`.

## 1. Para que serve

Montar os times do jogo da semana (ver [grupos.md](grupos.md)). O módulo é um **motor de composição**: as regras obrigatórias (ex.: 1 levantador por time) nunca são quebradas, e as preferências (ex.: espalhar homens e mulheres) são buscadas no melhor possível. O dono monta os times à mão ou sorteia, e os dois modos seguem as mesmas regras, que são do grupo. Resultado esperado: **times montados sem discussão na quadra**.

Caso de referência: vôlei misto de sexta, 12 vagas, 2 times de 6, 2 levantadores (um em cada time).

Hoje o módulo guarda as **posições de cada pessoa no grupo**. Os times vêm nas próximas etapas (seção 5).

| Termo     | Significado                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Jogador   | qualquer pessoa que joga no grupo: membro, reserva ou convidado. Tem posições **naquele grupo**                        |
| Posição   | onde a pessoa joga no esporte do grupo (ex.: levantador ou central no vôlei, goleiro no futebol). Pode não ter nenhuma |
| Principal | a posição em que a pessoa mais joga. É a primeira da lista dela, e o sorteio usa primeiro essa (etapas 4 e 5, seção 5) |

## 2. Regras de negócio

### Posições

- **TIM-01. As posições são da pessoa no grupo,** não do perfil. Valem para membros, reservas e convidados.
  - _Por quê:_ a mesma pessoa pode ser levantadora no vôlei de sexta e jogar de meia no futebol de domingo. O convidado entra nos times como qualquer um, então também precisa das posições.
- **TIM-02. As posições vêm do esporte do grupo, e o catálogo tem todas as posições do esporte:**
  - vôlei: levantador, oposto, ponteiro, central, líbero;
  - futebol: goleiro, zagueiro, lateral, volante, meia, atacante;
  - basquete: armador, ala, pivô;
  - outro: nenhuma.
  - A pessoa pode ter mais de uma posição, ou nenhuma (o padrão). **A primeira é a principal.** Uma posição de outro esporte responde `TEAM_POSITION_INVALID` (422, `details.position`).
  - _Por quê:_ com todas as posições, qualquer uma pode virar regra dos times depois (ex.: 1 central por time). A principal diz onde a pessoa rende mais, sem impedir que ela jogue em outra. Um esporte novo é só uma entrada no catálogo.
  - _Alterada em 2026-11-11:_ antes eram só as posições fixas (vôlei: levantador e líbero; futebol: goleiro), sem principal.
- **TIM-03. Todos do grupo veem as posições; só o dono muda.** Membros e reservas veem (`GET`); quem não participa do grupo recebe `GROUP_NOT_FOUND` (GRP-04). Mudar, para quem não é dono, responde `GROUP_NOT_OWNER` (403 com corpo). Com o grupo arquivado, mudar responde `GROUP_ARCHIVED` (GRP-32), e ver continua valendo.
  - _Por quê:_ posição não é avaliação de ninguém, e a lista fica mais útil ("quem levanta hoje?"). Quem monta os times é o dono.
  - _Alterada em 2026-11-11:_ antes só o dono via.
- **TIM-04. O dono define as posições de quem está no grupo ou na lista do jogo atual:** membros, reservas e convidados que estão dentro ou na fila. Para outra pessoa, a resposta é `TEAM_PLAYER_NOT_FOUND` (404).
  - A lista segue a ordem dos membros (GRP-06) e, depois, os convidados na ordem da lista do jogo. Com o grupo arquivado não há jogo (GRP-37), então ela tem só membros e reservas.
  - O que foi definido **fica guardado**, mesmo se a pessoa sair do grupo ou da lista. Se o convidado voltar outra semana, as posições dele já estão lá.
  - Estas são as posições **padrão** da pessoa. Mudar a posição só num jogo, sem mexer no padrão, vem com os times (etapa 2, seção 5).
  - _Por quê:_ o dono só classifica quem ele conhece pelo grupo ou pelo jogo, e não precisa repetir isso toda semana.

### Telas

- **TIM-05. As posições aparecem em dois lugares,** só em grupo de esporte com posições:
  - na aba **Membros**, em cada membro e reserva;
  - na aba **Jogo**, em cada pessoa da Escalação e do Banco, inclusive os convidados.
  - As posições ficam **abaixo do nome**, com a principal em destaque ("**Central** · Ponteiro"). Quem não tem posição não mostra nada para quem não é dono.
  - **O dono vê como mudar:** quem não tem posição mostra "+ Posição"; quem tem mostra as posições como botão. Tocar nelas (ou na linha) abre o painel de baixo "Posições de {nome}": as posições do esporte para marcar e desmarcar, e uma estrela para escolher a principal entre as marcadas (a primeira marcada já vem como principal).
  - Na aba Membros, cada pessoa fica num bloco separado (no desktop, em colunas com espaço entre elas), e as ações do dono sobre a pessoa (remover, convidar para membro) saem do meio da linha e vão para um menu "⋮" no fim dela.
  - Com o grupo arquivado, as posições aparecem, mas sem "+ Posição" e sem abrir o painel (GRP-37).
  - _Alterada em 2026-11-11:_ antes só o dono via, a função ficava ao lado do nome, e nada indicava que tocar abria o painel.

## 3. Como funciona

### Dados (single-table, sem GSI, ver [`dynamodb.md`](../../.claude/rules/dynamodb.md))

| Item             | Chave                                | Para quê                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jogador no grupo | `PLAYER#<groupId>#<userId>` / `META` | `positions`, na ordem (a primeira é a principal, TIM-02). Entidade de relação com chave natural ([ADR 0009](../decisions/0009-entidade-de-relacao-chave-natural.md)), separada da participação para valer também para convidados (TIM-01) |

Não há lookup: quem aparece na lista já vem dos membros e do jogo atual (módulo de grupos), e as chaves se montam pelo par.

### Onde está cada regra

| Arquivo                           | O que tem                                               |
| --------------------------------- | ------------------------------------------------------- |
| `contracts/src/teams.ts`          | posições e o catálogo de posições por esporte (TIM-02)  |
| `api/.../teams/player.service.ts` | permissão e quem pode ser classificado (TIM-02, 03, 04) |

### Rotas

| Rota                                | Quem               | Regras    |
| ----------------------------------- | ------------------ | --------- |
| `GET /groups/{id}/players`          | membros e reservas | TIM-01–04 |
| `PUT /groups/{id}/players/{userId}` | dono               | TIM-02–04 |

O `GET` devolve todos os membros, reservas e convidados da lista atual, cada um com as suas posições. O `PUT` recebe `{ positions }` (a primeira é a principal) e devolve o jogador.

Erros: `TEAM_PLAYER_NOT_FOUND`, `TEAM_POSITION_INVALID`, e os do grupo (`GROUP_NOT_FOUND`, `GROUP_NOT_OWNER`, `GROUP_ARCHIVED`).

## 4. Limites conhecidos

- A lista de jogadores é carregada junto com a página. Um convidado que confirma depois só pode ser classificado quando a página recarrega (qualquer ação do dono recarrega).
- O dono não tem uma lista dos convidados de semanas passadas: só classifica um convidado enquanto ele está na lista do jogo atual (TIM-04).

## 5. Em discussão (ainda não é regra)

Roteiro aprovado em 2026-11-10, em etapas que o dono testa no app antes da próxima:

2. **Times manuais, rascunho e publicação:** card "Times" no jogo; elenco = quem está dentro, e o dono puxa do banco ou tira gente; **o elenco traz uma cópia das posições, e o dono muda a posição de alguém só naquele jogo** (o padrão do grupo, TIM-04, não muda); nº de times; rascunho só do dono; publicado, todos da lista veem; quem saiu da lista depois fica marcado.
3. **Sortear (sem regras):** tamanhos com diferença de no máximo 1; quem o dono fixou à mão fica e o resto é sorteado; sortear de novo dá outro resultado.
4. **Regras obrigatórias do grupo, quantidade por time:** mínimo/máximo por posição ou gênero (ex.: 1 levantador por time, contando primeiro a posição principal), nos Ajustes; conflito explicado antes de sortear (`TEAM_RULES_CONFLICT`); configuração do grupo "permitir salvar times manuais fora das regras".
5. **Regra obrigatória, times opostos:** estas pessoas sempre em times diferentes. Também serve para separar quem joga melhor, sem precisar de nível.
6. **Preferência de gênero e avulsos:** espalhar homens e mulheres, com as métricas por time no resultado (uma preferência nunca quebra uma obrigatória); pessoa sem conta só no sorteio (fora do ranking) com as posições só naquele jogo.

Decidido: as regras são do grupo, e todo jogo segue as regras do grupo (o sorteio guarda uma cópia das que usou). Fixar uma pessoa num time é uma ação manual no jogo, não uma regra.

Fora por enquanto (2026-11-11): **nível técnico**. O dono achou subjetivo demais para o dono classificar à mão. Volta quando houver um critério melhor, como o nível calculado pelos resultados (E6). O motor fica pronto para uma preferência nova desse tipo.

Posição em cada partida (e não só no jogo): só se precisar, quando as partidas existirem (E4a).

Depois da E3: espalhar uma posição sem mínimo, manter pessoas juntas e a ligação com as partidas da E4a (o sorteio pode ter mais de 2 times, e cada partida usa 2 deles).
