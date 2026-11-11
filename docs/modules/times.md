# Módulo Times

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Se o código e este doc discordarem, um dos dois está errado. Conferido com o código em 2026-11-11.

Código: `apps/scorely/api/src/modules/teams/`, `apps/scorely/web/src/modules/teams/`. Contrato: `apps/scorely/contracts/src/teams.ts`.

## 1. Para que serve

Montar os times do jogo da semana (ver [grupos.md](grupos.md)). O módulo é um **motor de composição**: as regras obrigatórias (ex.: 1 levantador por time) nunca são quebradas, e as preferências (ex.: espalhar homens e mulheres) são buscadas no melhor possível. O dono monta os times à mão ou sorteia, e os dois modos seguem as mesmas regras, que são do grupo. Resultado esperado: **times montados sem discussão na quadra**.

Caso de referência: vôlei misto de sexta, 12 vagas, 2 times de 6, 2 levantadores (um em cada time).

Hoje o módulo guarda as **posições de cada pessoa no grupo** e os **times do jogo**, montados à mão pelo dono. O sorteio e as regras vêm nas próximas etapas (seção 5).

| Termo     | Significado                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Jogador   | qualquer pessoa que joga no grupo: membro, reserva ou convidado. Tem posições **naquele grupo**                        |
| Posição   | onde a pessoa joga no esporte do grupo (ex.: levantador ou central no vôlei, goleiro no futebol). Pode não ter nenhuma |
| Principal | a posição em que a pessoa mais joga. É a primeira da lista dela, e o sorteio usa primeiro essa (etapas 4 e 5, seção 5) |
| Times     | a divisão das pessoas do jogo em times ("Time 1", "Time 2"...). Uma por jogo, rascunho ou publicada                    |
| Sem time  | quem está dentro da lista (GRP-19) e ainda não foi posto em nenhum time                                                |

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
  - Estas são as posições **padrão** da pessoa. Mudar a posição só num jogo, sem mexer no padrão, é a TIM-13.
  - _Por quê:_ o dono só classifica quem ele conhece pelo grupo ou pelo jogo, e não precisa repetir isso toda semana.

### Times do jogo

- **TIM-06. Cada jogo tem no máximo uma divisão de times, e só o jogo atual** (GRP-11). Outra data responde `GAME_NOT_FOUND`. Ela não existe até o dono salvar a primeira vez, e o dono pode descartá-la.
  - _Por quê:_ o jogo atual é o único que existe hoje. O histórico dos times vem com as partidas (E4a).
- **TIM-07. Só o dono monta, muda, publica e descarta os times.** Quem não é dono recebe `GROUP_NOT_OWNER` (403 com corpo); quem não participa do grupo, `GROUP_NOT_FOUND` (GRP-04).
- **TIM-08. Como os times são montados:**
  - de 2 a 8 times, chamados "Time 1", "Time 2"... na ordem;
  - cada pessoa fica em um time só. Quem está dentro da lista e não foi posto em nenhum time fica "sem time";
  - o dono também pode pôr alguém do Banco (a fila) num time, e tirar qualquer um de um time;
  - só entra num time quem está na lista do jogo (dentro ou fila). Outra pessoa responde `TEAM_PLAYER_NOT_FOUND` (404);
  - o rascunho pode ter time vazio e gente sem time. Para publicar, todo time precisa de pelo menos uma pessoa: senão, `TEAM_EMPTY` (422, `details.team` = o número do time).
  - _Por quê:_ na quadra, às vezes alguém da fila joga no lugar de quem chegou atrasado. Gente sem time não bloqueia: o dono decide quem fica de fora.
- **TIM-09. Rascunho e publicação:**
  - enquanto é rascunho, só o dono vê os times. Para os outros, é como se não houvesse times;
  - publicados, todos do grupo veem, e os convidados também, pelo link do jogo (GRP-09);
  - depois de publicados, cada mudança que o dono salva já aparece para todos. O dono pode voltar para rascunho, e os times somem para os outros até publicar de novo.
  - sem times salvos, publicar responde `TEAM_EMPTY` (Time 1); voltar para rascunho e descartar não mudam nada.
  - _Por quê:_ o dono monta com calma, sem a lista ver um time pela metade; depois de publicado, uma troca na hora (alguém se machucou) não precisa de outro rascunho.
- **TIM-10. Aviso ao publicar:** na **primeira** publicação dos times do jogo, o aviso `teams_published` vai para todos da lista (dentro e fila), menos o dono. Publicar de novo depois de voltar para rascunho, ou mudar os times publicados, não avisa outra vez.
  - O link do aviso é o grupo; para o convidado, o link do jogo (como o GRP-22).
  - _Por quê:_ todo mundo quer saber em que time está, mas cada troca pequena virando aviso seria barulho.
- **TIM-11. Até quando dá para mexer:** enquanto o jogo é o atual e não está cancelado, até o fim dele (início + 3 h, GRP-12). Com o jogo cancelado, mudar responde `GAME_CANCELLED`, e os times não aparecem; reaberto (GRP-44), eles voltam como estavam. Com o grupo arquivado, mudar responde `GROUP_ARCHIVED` (GRP-32), e ver responde que não há times (arquivado não tem jogo, GRP-37).
  - _Por quê:_ durante o jogo o dono ainda troca gente entre os times (alguém chegou, alguém saiu).
- **TIM-12. Quem saiu da lista continua no time, marcado.** Se alguém de um time desiste, é removido ou sai do grupo, o time mostra a pessoa com a marca "saiu da lista", para todos. O dono tira a pessoa quando quiser. Quem entrou na lista depois aparece para o dono como "sem time".
  - _Por quê:_ os times não mudam sozinhos pelas costas do dono; ele vê o que mudou e decide.
- **TIM-13. Posição só no jogo:** cada pessoa nos times mostra as posições do grupo (TIM-04). O dono pode mudar as posições dela **só naquele jogo**, e o padrão do grupo não muda. Sem esse ajuste, vale o padrão do grupo, inclusive se ele mudar depois.
  - _Por quê:_ hoje faltou levantador e o Fulano vai levantar; na semana que vem ele volta a ser ponteiro.

### Telas

- **TIM-05. As posições aparecem em dois lugares,** só em grupo de esporte com posições:
  - na aba **Membros**, em cada membro e reserva;
  - na aba **Jogo**, em cada pessoa da Escalação e do Banco, inclusive os convidados.
  - As posições ficam **abaixo do nome**, com a principal em destaque ("**Central** · Ponteiro"). Quem não tem posição não mostra nada para quem não é dono.
  - **O dono vê como mudar:** quem não tem posição mostra "+ Posição"; quem tem mostra as posições como botão. Tocar nelas (ou na linha) abre o painel de baixo "Posições de {nome}": as posições do esporte para marcar e desmarcar, e uma estrela para escolher a principal entre as marcadas (a primeira marcada já vem como principal).
  - Na aba Membros, cada pessoa fica num bloco separado (no desktop, em colunas com espaço entre elas), e as ações do dono sobre a pessoa (remover, convidar para membro) saem do meio da linha e vão para um menu "⋮" no fim dela.
  - Com o grupo arquivado, as posições aparecem, mas sem "+ Posição" e sem abrir o painel (GRP-37).
  - _Alterada em 2026-11-11:_ antes só o dono via, a função ficava ao lado do nome, e nada indicava que tocar abria o painel.
- **TIM-14. Card "Times" na aba Jogo,** entre a abertura da lista e a Escalação (some com o jogo cancelado):
  - **dono, sem times:** "Montar times", que cria o rascunho com 2 times vazios e todos de dentro em "sem time";
  - **dono, com times:** cada time com o número de pessoas e, em cada pessoa, o nome e a posição principal no jogo (TIM-13). Uma marca "Rascunho" ou "Publicado", "sem time: N" quando houver, e a marca "saiu da lista" (TIM-12);
  - **mover alguém:** o dono toca na pessoa e escolhe no painel de baixo: Time 1, Time 2..., Sem time ou, para quem veio do Banco, Tirar dos times. O mesmo painel muda as posições só no jogo (TIM-13). Sem arrastar: tocar funciona igual no celular;
  - "Times: − 2 +" muda a quantidade. Ao diminuir, quem estava no time que sumiu vai para "sem time";
  - ações: Publicar (ou Voltar para rascunho) e, num menu "⋮", Descartar times, com confirmação;
  - **quem não é dono:** só os times publicados, sem ações, com o próprio time em destaque. Sem times publicados, o card não aparece;
  - **convidado, pela página do link do jogo:** os times publicados, como os outros veem.
  - Grupo arquivado não tem jogo (GRP-37), então não tem card.

## 3. Como funciona

### Dados (single-table, sem GSI, ver [`dynamodb.md`](../../.claude/rules/dynamodb.md))

| Item             | Chave                                | Para quê                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jogador no grupo | `PLAYER#<groupId>#<userId>` / `META` | `positions`, na ordem (a primeira é a principal, TIM-02). Entidade de relação com chave natural ([ADR 0009](../decisions/0009-entidade-de-relacao-chave-natural.md)), separada da participação para valer também para convidados (TIM-01)                         |
| Times do jogo    | `TEAMS#<groupId>#<data>` / `META`    | `status` (`draft`/`published`), `teams` (ids por time, na ordem), `positions` (só os ajustes do jogo, TIM-13), `publishedAt` (a 1ª publicação, TIM-10). Chave natural pelo jogo (grupo + data, como o `LOOKUP#GAME`), sem depender de o jogo já ter item (GRP-10) |

Não há lookup: quem aparece na lista já vem dos membros e do jogo atual (módulo de grupos), e as chaves se montam pelo par ou pela data.

### Onde está cada regra

| Arquivo                           | O que tem                                                            |
| --------------------------------- | -------------------------------------------------------------------- |
| `contracts/src/teams.ts`          | posições e o catálogo de posições por esporte (TIM-02)               |
| `api/.../teams/player.service.ts` | permissão e quem pode ser classificado (TIM-02, 03, 04)              |
| `api/.../teams/teams.service.ts`  | times do jogo: montar, publicar, aviso, prazo, quem saiu (TIM-06–13) |

### Rotas

| Rota                                                         | Quem                  | Regras                                  |
| ------------------------------------------------------------ | --------------------- | --------------------------------------- |
| `GET /groups/{id}/players`                                   | membros e reservas    | TIM-01–04                               |
| `PUT /groups/{id}/players/{userId}`                          | dono                  | TIM-02–04                               |
| `GET /groups/{id}/games/{date}/teams`                        | membros e reservas    | TIM-06, 09, 12, 13                      |
| `PUT /groups/{id}/games/{date}/teams`                        | dono                  | TIM-06–08, 11, 13                       |
| `POST /groups/{id}/games/{date}/teams/publish`, `/unpublish` | dono                  | TIM-08–11                               |
| `DELETE /groups/{id}/games/{date}/teams`                     | dono                  | TIM-06, 11                              |
| `GET /play/{token}/teams`                                    | logado (link do jogo) | TIM-09: só os times publicados (GRP-09) |

O `GET /players` devolve todos os membros, reservas e convidados da lista atual, cada um com as suas posições. O `PUT /players` recebe `{ positions }` (a primeira é a principal) e devolve o jogador.

O `GET /teams` devolve os times (ou que não há times), com cada pessoa marcada se saiu da lista e as posições valendo no jogo. O `PUT /teams` recebe `{ teams, positions }` e salva sem mudar o estado (rascunho continua rascunho, publicado continua publicado).

Erros: `TEAM_PLAYER_NOT_FOUND`, `TEAM_POSITION_INVALID`, `TEAM_EMPTY`, e os do grupo (`GROUP_NOT_FOUND`, `GROUP_NOT_OWNER`, `GROUP_ARCHIVED`, `GAME_NOT_FOUND`, `GAME_CANCELLED`).

## 4. Limites conhecidos

- A lista de jogadores é carregada junto com a página. Um convidado que confirma depois só pode ser classificado quando a página recarrega (qualquer ação do dono recarrega).
- O dono não tem uma lista dos convidados de semanas passadas: só classifica um convidado enquanto ele está na lista do jogo atual (TIM-04).
- Os times de um jogo que terminou ficam guardados, mas ninguém vê (não há histórico, GRP-11). As partidas (E4a) vão usá-los.
- Se o dono mexer nos times em dois aparelhos ao mesmo tempo, vale o último que salvou.

## 5. Em discussão (ainda não é regra)

Roteiro aprovado em 2026-11-10, em etapas que o dono testa no app antes da próxima (as etapas 1 e 2 já são regra, seção 2):

3. **Sortear (sem regras):** tamanhos com diferença de no máximo 1; quem o dono fixou à mão fica e o resto é sorteado; sortear de novo dá outro resultado.
4. **Regras obrigatórias do grupo, quantidade por time:** mínimo/máximo por posição ou gênero (ex.: 1 levantador por time, contando primeiro a posição principal), nos Ajustes; conflito explicado antes de sortear (`TEAM_RULES_CONFLICT`); configuração do grupo "permitir salvar times manuais fora das regras".
5. **Regra obrigatória, times opostos:** estas pessoas sempre em times diferentes. Também serve para separar quem joga melhor, sem precisar de nível.
6. **Preferência de gênero e avulsos:** espalhar homens e mulheres, com as métricas por time no resultado (uma preferência nunca quebra uma obrigatória); pessoa sem conta só no sorteio (fora do ranking) com as posições só naquele jogo.

Decidido: as regras são do grupo, e todo jogo segue as regras do grupo (o sorteio guarda uma cópia das que usou). Fixar uma pessoa num time é uma ação manual no jogo, não uma regra.

Fora por enquanto (2026-11-11): **nível técnico**. O dono achou subjetivo demais para o dono classificar à mão. Volta quando houver um critério melhor, como o nível calculado pelos resultados (E6). O motor fica pronto para uma preferência nova desse tipo.

Posição em cada partida (e não só no jogo): só se precisar, quando as partidas existirem (E4a).

Depois da E3: espalhar uma posição sem mínimo, manter pessoas juntas e a ligação com as partidas da E4a (o sorteio pode ter mais de 2 times, e cada partida usa 2 deles).
