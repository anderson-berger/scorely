# Módulo Competição

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-27.

Código: `apps/scorely/api/src/modules/groups/competitions/`, `apps/scorely/web/src/modules/groups/competitions/`. Contrato: `apps/scorely/contracts/src/competitions.ts`.

## 1. Para que serve

**A disputa entre as pessoas do grupo.** As partidas dizem o que aconteceu em cada dia (o resultado, [partidas.md](partidas.md), PAR-31–35). A competição junta esses dias num campeonato: quem soma mais pontos num período. Ela dá motivo para voltar toda semana e guarda a memória do grupo ("quem foi campeão do primeiro semestre").

A competição é **do grupo e individual**: cada pessoa soma os próprios pontos, mesmo jogando em time, porque os times mudam toda semana. Campeonato entre times de verdade, de grupos diferentes, é outro módulo, que vem depois e não depende dos grupos (seção 5).

Uma competição tem quatro peças: as **regras** (quanto vale cada coisa), o **período**, **quem disputa** e a **classificação** (o ranking). O ranking não existe sozinho: é sempre o de uma competição.

Hoje há um tipo, a **Temporada**: ela não cria jogos, só soma os resultados das partidas que **valem para ela**. Nem toda partida vale: a partida e a repetição escolhem para que competição valem (PAR-40). Os outros tipos (torneio de um dia, rei da quadra, escada) criam os próprios jogos e ficam para depois (seção 5).

Caso de referência: em janeiro, a Ana abre a "Temporada 2027.1", até 30 de junho, com vitória 3, empate 1 e derrota 0, e marca a repetição de sexta para valer. A pelada de terça, mais solta, fica de fora. Cada sexta com resultado soma na temporada. O Edu, que venceu 4 dos 5 jogos numa sexta por jogo, ganha 12 pontos naquele dia. Em março, alguém pergunta "quem está na frente?", e a resposta está na aba Competição, no geral e no feminino. No fim de junho, a temporada encerra, e três dias depois o ranking final fica guardado com o campeão.

| Termo          | Significado                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Competição     | uma disputa do grupo, de um tipo, com regras, período e ranking (COM-01)                                                             |
| Temporada      | o tipo de hoje: um período com nome, que soma os resultados das partidas que valem para ela (COM-02)                                 |
| Pontos         | quanto vale a vitória, o empate e a derrota em cada jogo (COM-03)                                                                    |
| Jogo           | **na competição**, cada disputa que dá ponto: a partida pelo dia conta como 1 jogo, e cada jogo da partida por jogo conta 1 (COM-05) |
| Vale para      | a escolha da partida e da repetição: as competições em que o resultado dela soma (PAR-40)                                            |
| Ranking        | a classificação de uma competição (COM-08)                                                                                           |
| Aproveitamento | as vitórias divididas pelos jogos, em porcentagem (COM-09)                                                                           |
| Prazo          | os 3 dias depois do fim da temporada, para registrar e corrigir os últimos resultados (COM-11)                                       |
| Travada        | a temporada que passou do prazo: o ranking final fica guardado e não muda mais (COM-11)                                              |

## 2. Regras de negócio

### Criar e editar

- **COM-01. Quem tem `competitions.manage` ([GRV-15](grupos.md)) abre uma competição** (`POST /groups/{publicId}/competitions` `{ type: 'season', name?, endDate, timeZone, points, seriesIds }`). Hoje o único tipo é `season` (COM-02).
  - `seriesIds` são as repetições ativas que passam a valer para ela (PAR-40): cada uma, e a próxima partida dela, se começa no período, ganham a competição no "Vale para", na mesma transação. Uma repetição que não existe ou já encerrada responde `MATCH_SERIES_NOT_FOUND` ou `MATCH_SERIES_ENDED`. Abrir a temporada é a única vez em que `competitions.manage` muda uma repetição: depois, o "Vale para" é de quem tem `matches.manage` (PAR-40).
  - O grupo tem no máximo **3 competições abertas** ao mesmo tempo (abertas ou no prazo, COM-11). A 4ª responde `COMPETITION_LIMIT` (409, `details.limit`).
  - Quem participa e não tem a permissão recebe `GROUP_PERMISSION_DENIED`; quem não participa, `GROUP_NOT_FOUND` (GRV-04).
  - _Por quê:_ o grupo pode querer duas disputas ao mesmo tempo, como o "Ranking do ano" e a temporada do semestre. O limite vai vir do plano da conta de quem criou o grupo (seção 5); até lá, 3 cobre os casos que conhecemos sem deixar a aba virar uma lista. Uma permissão própria porque quem organiza a partida da semana não precisa mexer no campeonato.

- **COM-02. A temporada começa no dia em que é aberta e termina no `endDate`**, as duas datas inclusive, no fuso de quem abre (`timeZone`, enviado pela tela, como na repetição, PAR-20).
  - Duração de **7 a 366 dias**. Fora disso, ou um fuso que não existe, `VALIDATION_ERROR` (422).
  - O nome tem de 1 a 40 caracteres. Sem nome, ela é "Temporada N" (N é a ordem de criação no grupo).
  - Não há programar uma temporada para começar depois: ela começa ao abrir.
  - _Por quê:_ as datas locais batem com o calendário que o grupo vê, e o fuso fica na temporada porque o grupo não tem fuso (GRV-01). Programar com antecedência fica de fora até alguém pedir: abrir no dia resolve a temporada de sempre.

- **COM-03. Os pontos são do grupo:** vitória, empate e derrota, cada um um número inteiro de **0 a 10**. A tela sugere **3 / 1 / 0**.
  - _Por quê:_ cada grupo vê a disputa de um jeito. Um premia só a vitória, outro dá 1 ponto pela derrota para premiar quem aparece. Três números se entendem sem modelo pronto. Sem ponto negativo enquanto não há falta (seção 5): perder não pode valer menos que não jogar.

- **COM-04. Quem tem `competitions.manage` muda a temporada** (`PUT /groups/{publicId}/competitions/{competitionId}` `{ name, endDate, points, expectedVersion }`, [ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)), enquanto ela está aberta ou no prazo.
  - O fim segue COM-02 (de 7 a 366 dias depois do início) e não fica antes de hoje.
  - **Os pontos só mudam enquanto nenhum resultado soma na temporada.** Depois, `COMPETITION_HAS_RESULTS` (409).
  - Temporada travada: `COMPETITION_LOCKED` (409). Uma que não existe: `COMPETITION_NOT_FOUND` (404). Versão velha: `VERSION_CONFLICT`.
  - _Por quê:_ ninguém muda a regra no meio do campeonato. Antes do primeiro resultado, mudar os pontos só corrige quem abriu com o valor errado.

### Quais partidas contam

- **COM-05. Uma partida soma na temporada quando:** vale para ela (PAR-40), começou dentro do período (do início do primeiro dia ao fim do último, no fuso da temporada), tem resultado (PAR-32) e não foi cancelada.
  - **Pelo dia** (PAR-33), a partida conta como **1 jogo**: quem está no time vencedor ganha a vitória, quem está nos outros times, a derrota; no empate, todos dos times ganham o empate.
  - **Por jogo** (PAR-34), **cada jogo** conta: cada pessoa ganha a vitória, o empate ou a derrota de cada jogo em que estava.
  - Os pontos são calculados ao ler, a partir dos resultados de agora: corrigir um resultado (PAR-32) muda o ranking na hora, até a temporada travar (COM-11).
  - _Por quê:_ a escolha é da partida porque nem toda partida é de campeonato: a avulsa, a festa ou a turma de outro dia ficam de fora (decidido em 2026-11-25). No rodízio, somar cada jogo premia quem joga e vence mais vezes na mesma noite, que é como o grupo decide o dia. Calcular ao ler faz a correção valer sem passo a mais.

- **COM-06. Só os membros de agora disputam.** Reservas e convidados jogam, ficam no resultado da partida e podem vencer o dia (PAR-34), mas não aparecem no ranking.
  - Quem sai do grupo, ou vira reserva, some do ranking enquanto a temporada não trava. Quem vira membro aparece com tudo o que jogou na temporada, também antes de virar membro.
  - _Por quê:_ o ranking é de quem disputa o campeonato do grupo. O convidado não tem conta, e a reserva joga quando sobra vaga: comparar com quem vem toda semana seria injusto com os dois lados. Guardar se a pessoa era membro em cada partida complicaria muito por um caso raro (seção 4).

### Ranking

- **COM-07. Quem participa do grupo vê as competições** (`GET /groups/{publicId}/competitions`): as abertas e no prazo primeiro, pelo fim; depois as travadas, da mais recente para a mais antiga. Cada uma vem com o tipo, o nome, as datas, a situação (`open`, `grace` ou `locked`, COM-11), os 3 primeiros do ranking geral e o lugar de quem pede.
- **COM-08. Quem participa do grupo vê o ranking** (`GET /groups/{publicId}/competitions/{competitionId}?cut=all|male|female`): a competição (COM-07), os pontos, a `version` (para COM-04), o que quem pede pode fazer, e uma linha por pessoa: a posição, o perfil (id público, apelido e foto, USR-13), os pontos, os jogos, as vitórias, os empates, as derrotas e o aproveitamento.
  - Aparece cada membro de agora (COM-06) com pelo menos 1 jogo na temporada.
  - **Recorte:** `all` (geral, o padrão), `male` ou `female`, pelo gênero do perfil de agora (USR). Quem não informou o gênero aparece só no geral.
  - Uma que não existe, ou de outro grupo: `COMPETITION_NOT_FOUND`.
  - A api responde os três recortes em qualquer grupo; quem decide mostrá-los é a tela, pela modalidade do grupo (COM-13).
  - _Por quê:_ o grupo misto compara homens e mulheres separados sem precisar de outra competição. Só quem jogou aparece para o ranking do começo da temporada não ser uma lista de zeros.
- **COM-09. A ordem:** mais pontos primeiro. Empatados: maior **aproveitamento** (vitórias ÷ jogos), depois **mais jogos**. Se ainda empatar, as pessoas **dividem a posição**, e a próxima pula (1º, 2º, 2º, 4º).
  - _Por quê:_ o aproveitamento separa quem ganhou de quem só jogou muito (decidido em 2026-11-10). Mais jogos premia quem veio mais. Desempate fixo, sem o grupo escolher, enquanto ninguém pedir outro.

### Encerrar

- **COM-10. Quem tem `competitions.manage` encerra a temporada antes do fim** (`POST /groups/{publicId}/competitions/{competitionId}/close`): o fim passa a ser hoje. Encerrar uma que já passou do fim não muda nada. Travada: `COMPETITION_LOCKED`.
  - _Por quê:_ o grupo que parou no meio (férias, quadra fechada) fecha o campeonato com quem estava na frente, sem esperar a data.
- **COM-11. A temporada passa por três situações:**

  | Situação           | Quando                  | O que muda                                                                                                |
  | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------- |
  | Aberta (`open`)    | até o fim do último dia | tudo (COM-04, PAR-40)                                                                                     |
  | No prazo (`grace`) | os 3 dias depois do fim | o ranking ainda acompanha os resultados; só o nome muda; partidas novas não entram (já é fora do período) |
  | Travada (`locked`) | depois do prazo         | nada: o **ranking final** fica guardado                                                                   |
  - Ao travar, o ranking final (todas as linhas, nos três recortes, com quem era membro naquele momento) é gravado uma vez e não muda mais: nem com um resultado corrigido depois (PAR-32 não tem prazo), nem com alguém saindo do grupo. O ranking da temporada travada (COM-08) é o guardado.
  - Trava a rotina que roda a cada dia, ou a primeira leitura depois do prazo, o que vier antes ([ADR 0012](../decisions/0012-rotina-diaria-na-lambda.md)). As duas nunca gravam duas vezes.
  - _Por quê:_ o prazo cobre o resultado do último dia, anotado na volta para casa. Travar é o que dá valor ao título: o campeão de uma temporada encerrada não muda.

### Telas (web)

- **COM-12. A área Competição** (`/groups/{publicId}/competitions`, na barra do grupo, GRV-13, depois das Partidas), para todos que participam, lista as competições (COM-07) em cartões: o nome, "até 30/06" (ou "Encerrada em 30/06", ou "Resultados até 03/07" no prazo), os 3 primeiros e o lugar de quem vê ("Você está em 4º").
  - Quem tem `competitions.manage` vê **Abrir temporada**, que abre um painel de baixo: o **nome** (opcional, com "Temporada N" de exemplo), o **fim** (data), os **pontos** (vitória, empate e derrota, em 3 / 1 / 0) e **Quais repetições entram**, uma linha de ligar para cada repetição ativa ("Toda sexta · 19:00"), todas ligadas. Aberta, a pessoa vai para a página dela.
  - Sem nenhuma: "Nenhuma competição ainda." e, para quem pode, o botão.
- **COM-13. A página da competição** (`/groups/{publicId}/competitions/{competitionId}`) mostra o nome, as datas, a situação e os pontos ("Vitória 3 · Empate 1 · Derrota 0"); no grupo **misto** (GRV-52), **Geral**, **Masculino** e **Feminino** no topo, e no masculino ou feminino, sem abas, só o geral; e o ranking em linhas: posição, foto e apelido, pontos e, embaixo, "12 jogos · 8 V · 1 E · 3 D · 67%". A linha de quem vê fica marcada. Nas posições divididas, o número se repete. Sem ninguém: "Ninguém jogou ainda. As partidas que valem para esta temporada somam aqui depois do resultado."
  - Sem abas, o geral mostra todo mundo que disputa, também quem é do outro gênero (a modalidade não barra ninguém, GRV-52). Mudada a modalidade, as abas aparecem ou somem na próxima vez que a página abre. _(Alterada em 2026-11-25: antes, as três abas apareciam sempre.)_
    - _Por quê:_ num grupo só de homens, o Masculino repetia o Geral e o Feminino ficava vazio.
  - Para quem tem `competitions.manage`, até travar: **Editar** (nome, fim e, enquanto não há resultado, os pontos, COM-04) e **Encerrar agora**, com confirmação ("O fim passa a ser hoje. Os resultados ainda podem ser corrigidos por 3 dias.").
  - Com `VERSION_CONFLICT`, a tela relê, fecha o painel e avisa: "Alguém mudou a temporada antes de você. Atualizamos; faça a mudança de novo."

## 3. Como funciona

### Dados (na partição do grupo, ADR 0014)

| Item            | Chave                                                             | Para quê                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Competição      | `GROUP#<g>` / `COMPETITION#<competitionId>`                       | entidade (`newEntity`): `type` (`season`), `name`, `number` (o N do nome padrão), `startDate` e `endDate` (datas locais), `timeZone`, `points` (`{ win, draw, loss }`), `lockedAt`, `createdBy`, `version`                                                                                                                                                   |
| Contador        | `GROUP#<g>` / `COMPETITIONSEQ`                                    | o último N (COM-02), somado com condição na mesma transação da criação                                                                                                                                                                                                                                                                                       |
| Ranking final   | `GROUP#<g>` / `COMPETITIONFINAL#<competitionId>`                  | as linhas dos três recortes ao travar (COM-11), gravado com `attribute_not_exists`, junto com o `lockedAt` da competição, numa transação                                                                                                                                                                                                                     |
| Agenda da trava | `COMPETITIONLOCK#<AAAA-MM-DD>` / `<instante>#<g>#<competitionId>` | `{ at, groupId, competitionId }`: "olhe esta competição no fim do prazo" (COM-11). A partição é o dia (UTC) do fim do prazo. Gravado na criação e trocado (o antigo apagado) quando o fim muda (COM-04, 10), na mesma transação. A rotina diária lê os últimos 31 dias, trava quem passou do prazo e apaga o item; `ttl` de 31 dias, como reserva (ADR 0004) |

- As competições do grupo são uma Query `begins_with(SK, "COMPETITION#")`. As abertas contam para o limite de COM-01 nessa mesma leitura.
- **O ranking** (COM-08) lê as partidas do período pelo índice do fim (`MATCHEND#`, [partidas.md](partidas.md) §3): uma Query entre o início do período e o fim mais 24 h (as partidas terminam depois de começar), e o BatchGet das partidas e dos resultados, como o histórico (PAR-36). Fica quem vale para a competição (PAR-40), começou no período, tem resultado e não foi cancelada. Os membros vêm da lista do grupo, e os perfis, de um BatchGet. A conta sai de uma função pura no contrato.
- "Nenhum resultado soma" (COM-04) é a mesma conta, parando no primeiro resultado.

### Rotas

| Rota                                                         | Quem                  | Regras                 |
| ------------------------------------------------------------ | --------------------- | ---------------------- |
| `POST /groups/{publicId}/competitions`                       | `competitions.manage` | COM-01–03, PAR-40      |
| `GET /groups/{publicId}/competitions`                        | quem participa        | COM-07, 11             |
| `GET /groups/{publicId}/competitions/{competitionId}`        | quem participa        | COM-05, 06, 08, 09, 11 |
| `PUT /groups/{publicId}/competitions/{competitionId}`        | `competitions.manage` | COM-04                 |
| `POST /groups/{publicId}/competitions/{competitionId}/close` | `competitions.manage` | COM-10                 |

Erros: `COMPETITION_NOT_FOUND` (404), `COMPETITION_LIMIT` (409), `COMPETITION_HAS_RESULTS` (409), `COMPETITION_LOCKED` (409), e os comuns (`VALIDATION_ERROR`, `GROUP_NOT_FOUND`, `GROUP_PERMISSION_DENIED`, `VERSION_CONFLICT`).

## 4. Limites conhecidos

- **Quem é membro é o de agora** (COM-06): a reserva que virou membro no meio da temporada soma também o que jogou como reserva, e o membro que virou reserva some. Guardar a participação em cada partida fica para quando alguém reclamar.
- **Partidas pelo dia e por jogo na mesma temporada pesam diferente:** a partida por jogo, com 5 jogos, vale até 5 vezes mais que a pelo dia. Cabe ao grupo não misturar; a tela não avisa.
- **O ranking é calculado a cada leitura** até travar: o custo cresce com as partidas do período (uma temporada de 1 ano com 3 repetições são ~160 partidas, num BatchGet de 2 itens por partida). Cabe bem; guardar o ranking parcial fica para quando não couber.
- Sem aviso: abrir, encerrar e travar não avisam ninguém (seção 5).

## 5. Em discussão (ainda não é regra)

Conversa de produto de 2026-11-25:

- **Votação do dia** (a próxima etapa), opcional por grupo: depois da partida, quem jogou (está no resultado) vota, em segredo e sem votar em si, até 48 h depois do fim: o melhor do seu time, o melhor do adversário, o melhor geral e o **pior do dia**, em tom de brincadeira (o nome é do dono). Todos veem só o total. A temporada usa os votos como **destaques** (craque da temporada, e o "pior" como meme).
- **Destaques** além dos votos: mais presente, maior sequência, quem mais venceu o dia.
- **Nível manual**, para o sorteio dos times ([partidas.md](partidas.md), seção 5): de 1 a 5, dado por quem tem `matches.manage`, visto só por quem tem a permissão, para membros e reservas; o convidado ganha o nível na partida (sem nível, 3). Fica no módulo das partidas, que é quem sorteia. O cálculo automático pelos resultados (E6 do PRODUCT.md) vem depois, com "ligar cálculo automático" e o manual podendo corrigir.
- **Outros tipos de competição**, que criam os próprios jogos: **torneio de um dia** (chave e mata-mata, times formados na hora), **rei da quadra** (duplas que trocam a cada jogo, cada um soma o seu) e **escada** (desafiar quem está acima e tomar o lugar).
- **Chamada e falta**: quem estava dentro e faltou, valendo ponto (inclusive negativo). Hoje não há chamada (PAR-32).
- **Prêmios e avisos**: troféus no perfil, aviso ao encerrar e ao entrar no pódio (como na antiga Competição, [arquivo/competicao.md](arquivo/competicao.md), CMP-36–39).
- **Limite pelo plano**: quantas competições ao mesmo tempo vai depender do plano da conta de quem criou o grupo; se o módulo vira pago, fica para decidir.
- **Campeonatos** (outro módulo, fora dos grupos): times de verdade, de grupos diferentes, com tabela e chave.
