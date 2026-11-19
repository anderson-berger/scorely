# Módulo Competição

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Se o código e este doc discordarem, um dos dois está errado. Conferido com o código em 2026-11-19.

Código: `apps/scorely/api/src/modules/competition/`, `apps/scorely/web/src/modules/competition/`. Contrato: `apps/scorely/contracts/src/competition.ts`.

## 1. Para que serve

A competição interna do grupo: pontos por jogo, ranking do grupo e por temporada, pódio e prêmios. Serve para dar motivo de voltar toda semana e guardar a memória do grupo. Resultado esperado: **cada grupo compete do jeito dele, sem planilha**.

**O app não impõe um modelo de competição.** Ele oferece os blocos (quanto vale cada coisa, como conta, como desempata), e cada grupo monta o seu regulamento. O grupo de referência é um caso entre outros.

Caso de referência: vôlei misto de sexta. Vitória vale 3, derrota vale 1, quem não confirmou fica com 0 e quem confirmou e faltou perde 2.

É um **módulo à parte, ativado por grupo, e pago**, com um período de teste. Os módulos de grupos e de times não dependem dele: sem a competição, o grupo funciona igual.

Hoje o módulo tem a **ativação** (teste e plano), o **regulamento do grupo** e o **fechamento de cada jogo** (chamada e resultado do dia), as **partidas** (unidade por partida), com os pontos de cada pessoa no jogo, o **ranking do grupo**, com o histórico de cada pessoa, as **temporadas**, cada uma com o seu regulamento, o seu ranking e o pódio, e os **prêmios**: troféus no perfil, notificações e o card do pódio para compartilhar.

| Termo       | Significado                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Competição  | o módulo, ativado num grupo. Estado: desativada, ativa (no teste ou no plano) ou vencida (CMP-01)                                             |
| Teste       | os 30 dias grátis que o dono do grupo começa uma vez (CMP-02)                                                                                 |
| Plano       | a competição paga, liberada depois do teste (CMP-03)                                                                                          |
| Regulamento | como o grupo pontua e desempata: os pontos de cada acontecimento, a unidade e o desempate (CMP-06)                                            |
| Unidade     | o que vale ponto: **cada partida** do jogo, ou **o dia** inteiro, com um resultado só (CMP-06)                                                |
| Falta       | quem confirmou, estava dentro da lista e não veio. Quem fecha marca na chamada (CMP-12)                                                       |
| Organizador | **neste módulo**, quem tem a permissão `seasons.manage` ([GRP-49](grupos.md)): o dono do grupo ou quem tem um cargo com ela (o Admin, GRP-50) |
| Quem fecha  | **neste módulo**, quem tem a permissão `results.record` ([GRP-49](grupos.md)): o dono do grupo ou o Admin. Fecha os jogos (CMP-11)            |
| Fechar      | registrar a chamada e o resultado de um jogo que já começou (CMP-11). Um jogo fechado pode ser corrigido (CMP-15)                             |
| Amistoso    | jogo fechado em que ninguém pontua (CMP-15)                                                                                                   |

## 2. Regras de negócio

### Ativação

- **CMP-01. A competição é ativada por grupo, e o estado sai das datas, na leitura:**
  - **desativada:** o grupo nunca começou o teste;
  - **ativa:** a data "ativa até" ainda não passou. Pode ser no **teste** ou no **plano**;
  - **vencida:** a data "ativa até" já passou.
  - Nada é apagado ao vencer. Quando a data volta a ser futura (o plano é liberado, CMP-03), a competição volta de onde parou.
  - _Por quê:_ o módulo é pago, então o grupo precisa poder parar de pagar sem perder o que construiu. Calcular o estado pela data dispensa um agendador para "desligar" o módulo.
- **CMP-02. Só o dono começa o teste:** 30 dias a partir de agora, **uma vez por grupo** (`POST /groups/{id}/competition/trial`).
  - O grupo já usou o teste (mesmo vencido, ou com outro dono): `COMPETITION_TRIAL_USED` (409).
  - Quem não é dono: `GROUP_NOT_OWNER`. Grupo arquivado: `GROUP_ARCHIVED` (GRP-32). A ordem dos erros é a da GRP-52 (quem não participa, quem não é dono, arquivado), e só então o teste já usado.
  - Ao começar, o grupo ganha o regulamento do modelo "Pelada clássica" (CMP-08).
  - _Por quê:_ ativar é o compromisso do grupo com um módulo pago, como arquivar e passar o grupo, que também são só do dono (GRP-49). Ser uma vez por grupo, e não por pessoa, impede renovar o teste passando o grupo para outro dono.
- **CMP-03. Depois do teste, a competição continua pelo plano.** Por enquanto não há cobrança no app: a equipe do scorely libera o plano mudando a data "ativa até" do grupo direto no banco.
  - _Por quê:_ a cobrança de verdade (meio de pagamento, recibos, cancelamento) é uma entrega própria. Separar o "está ativa?" numa data deixa a cobrança trocar só quem muda essa data.
- **CMP-04. Desativada ou vencida, a competição é só leitura.** Quem participa continua vendo tudo (CMP-05), e nenhuma mudança é aceita: `COMPETITION_INACTIVE` (409).
  - _Por quê:_ o grupo não perde o histórico por deixar de pagar, e o organizador vê o que volta quando o plano é liberado.
- **CMP-05. Membros e reservas veem o estado da competição e o regulamento** (`GET /groups/{id}/competition`), inclusive com a competição vencida e com o grupo arquivado. Convidados não veem: quem não participa recebe `GROUP_NOT_FOUND` (GRP-04).
  - A resposta diz o estado (CMP-01), se é teste ou plano, a data "ativa até", se o teste ainda está disponível e o regulamento (ausente enquanto desativada).
  - _Por quê:_ quem joga precisa saber quanto vale cada coisa antes de valer. A competição é só de quem participa do grupo.

### Regulamento

- **CMP-06. Cada grupo tem um regulamento:**
  - **Pontos**, um número inteiro de **−10 a 10** para cada acontecimento:

    | Acontecimento  | Quem recebe                                                       |
    | -------------- | ----------------------------------------------------------------- |
    | Vitória        | quem estava no time vencedor (da partida ou do dia, pela unidade) |
    | Empate         | todos que jogaram uma partida empatada, ou o dia sem vencedor     |
    | Derrota        | quem estava num time que perdeu                                   |
    | Não confirmou  | o membro que não confirmou presença no jogo                       |
    | Falta          | quem confirmou, estava dentro da lista e não veio                 |
    | Jogo cancelado | quem estava dentro da lista de um jogo cancelado                  |

  - **Unidade:** **por partida** (cada partida do jogo dá pontos) ou **pelo dia** (o jogo inteiro tem um resultado só: o time vencedor do dia, ou empate).
  - **Desempate:** uma lista ordenada, sem repetir, dos critérios do catálogo. Pode ficar vazia. O catálogo começa com:
    - **mais presente:** mais jogos com presença;
    - **maior sequência:** a maior sequência de presenças seguidas.

    Se ainda empatar depois de todos os critérios, as pessoas dividem a posição.

  - Só membros recebem pontos. Reservas, avulsos e convidados jogam, mas não pontuam.
  - O total de uma pessoa nunca fica abaixo de 0: soma tudo e, se der negativo, mostra 0.
  - _Por quê:_ cada grupo tem uma visão da competição. Um quer premiar presença, outro só vitória, outro punir quem confirma e falta. O empate tem valor próprio porque em alguns esportes a partida empata, e no modo pelo dia um dia sem vencedor é comum. A unidade pelo dia existe porque em muitos grupos o time é o mesmo a noite toda, com gente entrando e saindo, e anotar cada partida não faz sentido. O mínimo 0 vale para o total, e não jogo a jogo, para a ordem das correções nunca mudar o resultado.
- **CMP-07. Só o organizador (`seasons.manage`) muda o regulamento** (`PUT /groups/{id}/competition/rules`, com o regulamento inteiro).
  - Quem não tem a permissão: `GROUP_PERMISSION_DENIED`. Grupo arquivado: `GROUP_ARCHIVED`. Desativada ou vencida: `COMPETITION_INACTIVE` (CMP-04). Valor fora da faixa, critério repetido ou fora do catálogo: `VALIDATION_ERROR`.
  - A ordem dos erros é a da GRP-52 (quem não participa, a permissão, arquivado), e só então a competição desativada ou vencida.
  - A mudança vale a partir dela. Cada jogo fechado guarda uma cópia do regulamento que valia (CMP-14), e cada temporada guarda a dela (CMP-29), então mudar nunca reescreve o passado. Durante uma temporada, a mudança só vale para a próxima (CMP-31).
  - _Por quê:_ o regulamento é o que decide a disputa, e fica com quem organiza a competição. Mandar o regulamento inteiro evita duas pessoas mudando partes diferentes e deixando um regulamento que ninguém escolheu.
- **CMP-08. Os modelos prontos só preenchem o regulamento.** O app não guarda qual modelo foi escolhido, e o organizador pode mudar qualquer valor depois.

  | Modelo              | Vitória | Empate | Derrota | Não confirmou | Falta | Cancelado | Unidade     | Desempate                       |
  | ------------------- | ------- | ------ | ------- | ------------- | ----- | --------- | ----------- | ------------------------------- |
  | **Pelada clássica** | 3       | 2      | 1       | 0             | −2    | 0         | pelo dia    | mais presente → maior sequência |
  | **Só vitórias**     | 1       | 0      | 0       | 0             | 0     | 0         | por partida | mais presente                   |
  | **Presença conta**  | 3       | 2      | 2       | 0             | −3    | 1         | pelo dia    | maior sequência → mais presente |
  - _Por quê:_ ninguém precisa entender todos os campos para começar. O modelo é um ponto de partida, e não um modo do sistema que travaria o grupo nele.

### Fechar o jogo

- **CMP-11. Quem tem `results.record` fecha o jogo** a partir do início dele, com a competição ativa ([GRP-49](grupos.md)). Fechar é registrar a chamada (CMP-12) e, no modo pelo dia, o resultado (CMP-13).
  - Vale para o jogo em andamento e para os **jogos anteriores desde a ativação da competição** (o 1º jogo é o primeiro que começou depois de `trialStartedAt`). Jogo de antes da ativação não entra na competição.
  - Só jogo que virou item (alguém confirmou, ou foi cancelado, GRP-10). Semana sem ninguém não tem o que fechar.
  - Jogo que não começou: `GAME_NOT_STARTED` (409). Data que não é um jogo do grupo, ou de antes da ativação: `GAME_NOT_FOUND`. Competição desativada ou vencida: `COMPETITION_INACTIVE` (CMP-04). Grupo arquivado: `GROUP_ARCHIVED`. A ordem dos erros é a da CMP-07.
  - Jogo de uma temporada já travada (CMP-32): `SEASON_CLOSED` (409), depois de `GAME_NOT_STARTED`.
  - _Por quê:_ quem esquece de fechar no dia não perde o jogo. Contar só a partir da ativação evita que o grupo ganhe pontos de semanas em que ninguém sabia que valia ponto.
- **CMP-12. A chamada:** cada pessoa da lista do jogo (dentro e fila, de qualquer papel) é marcada como **veio** ou **faltou**. Os avulsos (TIM-24) não entram na chamada: se estão num time, vieram.
  - Ao abrir a chamada pela 1ª vez, quem estava dentro vem marcado como "veio" e quem estava na fila, como "faltou". Com a unidade por partida, quem está em alguma partida vem como "veio" (CMP-21). Quem fecha só muda o que foi diferente.
  - Jogo cancelado não tem chamada nem resultado: fechar só confirma que ele entra na competição como cancelado (CMP-14).
  - _Por quê:_ só quem administra sabe quem apareceu, e o app não deduz. Na maioria das semanas quase todo mundo de dentro vem, então o padrão faz a chamada levar segundos.
- **CMP-13. O resultado do dia** (só com a unidade "pelo dia", CMP-06): o **time vencedor** entre os times publicados do jogo ([TIM-10](times.md)), ou **empate**.
  - Sem times publicados, o jogo fecha só com a chamada, e quem veio fica sem resultado (0 ponto de vitória, empate ou derrota). Empate também precisa de times publicados (`RESULT_INVALID`).
  - Com a unidade "por partida", o fechamento é só a chamada, e os pontos de quem veio saem das partidas (CMP-22).
  - _Por quê:_ o time vencedor é o jeito mais rápido de registrar o dia. Usar os times publicados evita montar os times de novo.
- **CMP-14. Os pontos do jogo saem do fechamento e da cópia do regulamento.** Ao fechar pela 1ª vez, o jogo guarda uma **cópia do regulamento** (o da temporada, se o jogo é de uma, CMP-31; senão, o do grupo), a **lista dos membros do grupo** e a **lista do jogo** (quem estava dentro e quem estava na fila) daquele momento. Só esses membros pontuam (CMP-06):

  | Situação do membro                                                 | Pontos                                 |
  | ------------------------------------------------------------------ | -------------------------------------- |
  | não está na lista do jogo                                          | não confirmou                          |
  | estava dentro e faltou                                             | falta                                  |
  | estava na fila e faltou                                            | 0                                      |
  | veio e está no time vencedor                                       | vitória                                |
  | veio e está em outro time, ou veio fora dos times, com um vencedor | derrota                                |
  | veio, com o dia empatado                                           | empate                                 |
  | veio, sem resultado (sem times publicados)                         | 0                                      |
  | unidade por partida: veio                                          | a soma das partidas que jogou (CMP-22) |
  | jogo cancelado: estava dentro                                      | jogo cancelado                         |
  | jogo cancelado: fila ou não confirmou                              | 0                                      |
  - Reservas, convidados e avulsos aparecem na chamada e nos times, mas ficam com 0.
  - Os pontos são calculados na leitura, a partir do que foi guardado. O total abaixo de 0 só vira 0 no ranking (CMP-06), então um jogo mostra o valor como ele é (ex.: −2).
  - _Por quê:_ guardar a cópia faz uma mudança no regulamento nunca reescrever um jogo já fechado. Guardar quem era membro faz a reserva que vira membro pontuar só daí em diante. Quem veio de fora dos times jogou e não venceu. Quem estava na fila e faltou não tinha vaga garantida, então não é punido.

- **CMP-15. Corrigir um jogo fechado** troca a chamada, o resultado e a marca de amistoso de uma vez. Ela copia de novo os times publicados de agora. A cópia do regulamento, a lista dos membros e a lista do jogo continuam as do 1º fechamento. A correção fica liberada com a competição ativa, até a temporada do jogo travar (CMP-32).
  - **Amistoso:** quem fecha pode marcar o jogo como amistoso. O jogo continua fechado e visível, mas ninguém pontua nele.
  - _Por quê:_ errar a chamada na beira da quadra é comum, e quem fecha corrige sem perder o que já valia. O amistoso cobre a semana diferente (festa, jogo contra outro grupo) sem apagar o jogo.
- **CMP-16. Membros e reservas veem os jogos da competição** (`GET /groups/{id}/competition/games`): os jogos desde a ativação, do mais recente para o mais antigo, cada um como **fechado**, **para fechar** ou **cancelado**. Abrir um jogo mostra a chamada, o resultado e os pontos de cada pessoa. Vale também com a competição vencida e com o grupo arquivado (CMP-05). Quem não participa do grupo recebe `GROUP_NOT_FOUND`.
  - Jogo "para fechar" mostra a lista, os times e as partidas, sem a chamada e sem os pontos. A chamada sugerida (CMP-12) aparece só para quem tem `results.record`.
  - O papel de cada pessoa (membro ou reserva) aparece como era no 1º fechamento. Num jogo ainda não fechado, o de agora.
  - Com a competição desativada, a lista vem vazia. Abrir um jogo que ainda não começou responde `GAME_NOT_STARTED`.

### Partidas (unidade por partida)

- **CMP-19. Quem tem `results.record` registra as partidas** de um jogo com a unidade "por partida": a da cópia do regulamento, se o jogo já foi fechado, ou a do regulamento de agora, se não. Vale nas mesmas condições de fechar (CMP-11): a partir do início, com a competição ativa, nos jogos desde a ativação.
  - Registrar partida **não precisa do jogo fechado**. A chamada e as partidas são independentes, e os pontos aparecem quando o jogo é fechado (CMP-22).
  - Jogo com a unidade "pelo dia": `MATCH_INVALID` (422, `reason: day_unit`). Jogo cancelado: `GAME_CANCELLED`. Jogo de uma temporada travada: `SEASON_CLOSED`.
  - _Por quê:_ a partida é registrada na hora, na beira da quadra, e a chamada pode ser feita no fim.
- **CMP-20. Uma partida tem dois times e um resultado:** o Time A venceu, o Time B venceu, ou empate.
  - Cada time tem pelo menos 1 pessoa, e ninguém está nos dois. Os times não precisam ter o mesmo tamanho.
  - Entra quem está na lista do jogo (dentro ou fila, de qualquer papel) e os avulsos dos times publicados (TIM-24).
  - Outra pessoa, time vazio ou pessoa repetida: `MATCH_INVALID` (`reason`: `person_unknown`, `team_empty` ou `person_repeated`; `details.userId` quando é uma pessoa).
  - Até **30 partidas** por jogo. Passou disso: `GAME_MATCHES_FULL` (409).
  - As partidas ficam na ordem em que foram registradas e aparecem numeradas (Partida 1, 2, 3...). Apagar uma renumera as seguintes.
  - Corrigir troca os times e o resultado de uma vez. Partida que não existe, ou é de outro jogo: `MATCH_NOT_FOUND` (404).
  - _Por quê:_ no rodízio da pelada nem todo mundo joga todas, então só os times de cada partida dizem quem ganhou e quem perdeu. Placar e quem fez cada ponto ficam para depois, sem mudar esta regra.
- **CMP-21. Quem jogou uma partida veio.**
  - Na chamada sugerida (CMP-12), quem está em alguma partida vem marcado como "veio", mesmo quem estava na fila.
  - Fechar marcando "faltou" para quem jogou uma partida: `RESULT_INVALID` (`reason: absent_played`, `details.userId`).
  - Num jogo já fechado, pôr numa partida alguém marcado como "faltou": `MATCH_INVALID` (`reason: person_absent`). Quem fecha corrige a chamada antes.
  - _Por quê:_ a partida é a prova de que a pessoa estava lá. Deixar as duas coisas discordarem daria falta e vitória para a mesma pessoa no mesmo dia.
- **CMP-22. Os pontos por partida:** com a unidade "por partida", cada membro que veio soma, em cada partida que jogou, a **vitória**, o **empate** ou a **derrota** do regulamento. Quem veio e não jogou nenhuma partida fica com 0. "Não confirmou", "falta" e "jogo cancelado" valem uma vez por jogo, como na CMP-14.
  - Os pontos saem das partidas como estão (corrigir ou apagar uma partida muda os pontos na hora) e da cópia do regulamento do fechamento. Antes de fechar, o jogo não mostra pontos (CMP-16).
  - Amistoso: as partidas aparecem, e ninguém pontua (CMP-15).
  - **Vencedor do dia:** quem tem mais vitórias no jogo, se tiver pelo menos uma. Empate: todos os empatados. Qualquer pessoa pode ser vencedor do dia, também reserva, convidado e avulso. Ele só aparece na tela, sem ponto a mais.
  - _Por quê:_ é assim que o rodízio decide o dia (umas 5 partidas, ganha quem venceu mais). Somar por partida premia quem joga e vence mais vezes na mesma noite.

### Ranking e histórico

- **CMP-24. O ranking do grupo soma os pontos de todos os jogos fechados desde a ativação,** cada jogo pela sua cópia do regulamento (CMP-14) e pelas suas partidas (CMP-22). É calculado na leitura, então fechar ou corrigir um jogo muda o ranking na hora.
  - **Total mínimo 0:** soma tudo e, se der negativo, mostra 0 (CMP-06).
  - O jogo amistoso entra com 0 (CMP-15). O jogo ainda não fechado não entra.
  - Membros e reservas veem (`GET /groups/{id}/competition/ranking`), também com a competição vencida e com o grupo arquivado. Quem não participa recebe `GROUP_NOT_FOUND`. Com a competição desativada, o ranking vem vazio.
  - _Por quê:_ é a disputa do grupo. Calcular na leitura faz a correção valer na hora, e a cópia de cada jogo faz uma mudança no regulamento nunca reescrever o passado.
- **CMP-25. Quem aparece no ranking: os membros de agora.**
  - Cada membro aparece, mesmo com 0 ponto. Quem saiu do grupo, ou virou reserva, some do ranking, e os jogos antigos continuam mostrando os pontos dele (CMP-14).
  - Só contam os jogos em que a pessoa era membro no fechamento (CMP-14). A reserva que vira membro começa a somar daí.
  - **Recorte:** geral, masculino ou feminino, pelo gênero do perfil de agora ([USR](usuarios.md)). Quem não informou o gênero aparece só no geral.
  - _Por quê:_ o ranking é de quem disputa hoje. O recorte por gênero atende o grupo misto que compara homens e mulheres separados, sem precisar de outra competição.
- **CMP-26. A ordem:** mais pontos primeiro. Empatados, vale o desempate do regulamento de agora (CMP-06), na ordem que o grupo escolheu:
  - **mais presente:** mais jogos com presença ("veio" na chamada);
  - **maior sequência:** a maior sequência de presenças seguidas, na ordem dos jogos. Uma falta, ou não estar na lista, quebra a sequência.
  - As duas contagens usam só os jogos fechados em que a pessoa era membro, **sem os amistosos e sem os cancelados**, que não quebram nem somam.
  - Se ainda empatar, as pessoas **dividem a posição**, e a próxima pula (1º, 2º, 2º, 4º).
  - _Por quê:_ o desempate é do grupo, e o amistoso e o cancelado não são semanas normais de jogo: contar presença neles premiaria ou puniria quem não podia escolher.
- **CMP-27. O histórico de cada pessoa** (`GET /groups/{id}/competition/people/{userId}`): os jogos fechados desde a ativação em que ela estava na lista ou era membro, do mais recente para o mais antigo. Cada jogo mostra o que aconteceu ("veio · Time 2", "faltou", "3 V · 1 E · 1 D") e os pontos, e no topo vêm o total, as presenças e a maior sequência.
  - Membros e reservas veem o histórico de qualquer pessoa do grupo, inclusive de quem saiu. Pessoa que nunca esteve no grupo: `GROUP_MEMBER_NOT_FOUND`.
  - _Por quê:_ cada um confere de onde vieram os próprios pontos, e o grupo tira dúvida sem perguntar para quem fecha.

### Temporadas

- **CMP-29. Uma temporada é um período do grupo com nome, data de início e data de fim** (datas locais, no fuso do grupo, a de fim inclusive), e com o **seu regulamento**: a cópia do regulamento do grupo do momento em que ela foi aberta ou programada.
  - Duração de **7 dias a 1 ano** (366 dias). Fora disso: `SEASON_INVALID` (422, `reason: duration`).
  - O nome tem de 1 a 40 caracteres. Sem nome, a temporada é "Temporada N" (a ordem de criação no grupo).
  - Os jogos da temporada são os que acontecem entre as duas datas. Jogo de fora dela continua no ranking do grupo (CMP-24), e só nele.
  - _Por quê:_ a temporada dá um começo e um fim para a disputa, com campeão. As datas locais batem com o calendário que o grupo vê.
- **CMP-30. Quem tem `seasons.manage` abre ou programa a temporada** (`POST /groups/{id}/competition/seasons`), com a competição ativa.
  - **Abrir agora:** começa hoje. **Programar:** começa numa data futura, até 1 ano à frente. Data de início no passado: `SEASON_INVALID` (`reason: past_start`); mais de 1 ano à frente: `SEASON_INVALID` (`reason: too_far`).
  - **Uma temporada por vez:** as datas não podem cruzar com as de nenhuma outra (aberta, programada ou encerrada, contando os dois dias de ponta). Senão, `SEASON_INVALID` (`reason: overlap`). Quem encerra hoje abre a próxima a partir de amanhã. Entre duas temporadas pode haver um período sem temporada.
  - A programada (ainda não começou) pode ter o nome, as datas e o regulamento trocados, ou ser cancelada (apagada). Depois de começar, só o nome muda, e ela pode ser encerrada antes da data (CMP-32).
  - _Por quê:_ uma por vez deixa claro qual campeonato vale. Programar deixa o organizador preparar a próxima, com o regulamento novo, sem mexer na que está valendo.
- **CMP-31. Durante a temporada, o regulamento dos jogos é o dela.** O jogo fechado dentro do período guarda a cópia do regulamento da temporada (CMP-14), e não a do grupo. Mudar o regulamento do grupo (CMP-07) no meio da temporada só vale para a próxima temporada e para os jogos de fora de temporada.
  - O desempate do ranking da temporada é o dela (CMP-26).
  - _Por quê:_ ninguém muda a regra no meio do campeonato.
- **CMP-32. Encerrar:** a temporada termina sozinha no fim do dia de fim, ou antes, quando quem tem `seasons.manage` encerra (`POST .../seasons/{seasonId}/close`, que passa o fim para hoje).
  - Depois do fim, há um **prazo de 3 dias** para fechar e corrigir os jogos da temporada, e registrar as partidas deles. Passado o prazo, a temporada **trava**: fechar, corrigir e partidas nos jogos dela respondem `SEASON_CLOSED` (409). Encerrar antes da data trava na hora, sem prazo.
  - Ao travar, o **ranking final** da temporada (todas as linhas, com o pódio) fica guardado e não muda mais, nem se alguém sair do grupo.
  - O jogo da temporada que ficou sem fechar não entra no ranking dela.
  - _Por quê:_ o prazo cobre o jogo do último dia, fechado na volta para casa. Travar é o que dá valor ao título: o campeão de uma temporada encerrada não muda.
- **CMP-33. O ranking da temporada** (`GET /groups/{id}/competition/ranking?season={seasonId}`) segue as regras do ranking do grupo (CMP-24–26), só com os jogos dela e com o desempate dela.
  - Enquanto ela está aberta, ou no prazo, é calculado na leitura, com os membros de agora.
  - Travada, é o ranking final guardado (CMP-32), com quem era membro ao travar, mesmo quem saiu depois.
  - **Pódio:** as posições 1, 2 e 3. Com empate, entram todos os empatados (pode ter mais de 3 pessoas).
  - O recorte por gênero (CMP-25) vale também, com o gênero de agora.
- **CMP-34. Membros e reservas veem as temporadas** (`GET /groups/{id}/competition/seasons`): a aberta, a programada e as encerradas, da mais recente para a mais antiga, com o nome, as datas, o estado (programada, aberta, no prazo, encerrada) e, nas encerradas, o pódio. Vale também com a competição vencida e com o grupo arquivado.

### Prêmios

- **CMP-36. Ao travar (CMP-32), a temporada entrega os troféus**, a partir do ranking final guardado:
  - **pódio:** campeão (1º), vice (2º) e 3º. Com empate, todos os empatados recebem o troféu daquela posição;
  - **destaques:** **mais presente** (mais presenças na temporada) e **maior sequência** (a maior sequência de presenças seguidas). Precisa de pelo menos 1 presença. Com empate, todos recebem;
  - só quem está no ranking final (os membros ao travar) recebe. Uma temporada sem nenhum jogo fechado não entrega troféus nem manda os avisos de fim (CMP-38).
  - O troféu é para sempre: sair do grupo, corrigir algo depois (não dá, está travado) ou o grupo arquivar não tira.
  - _Por quê:_ o troféu é a memória do grupo: quem foi campeão de qual temporada. Os destaques premiam quem aparece, além de quem vence.
- **CMP-37. Onde os troféus aparecem:**
  - no **perfil** de quem recebeu, a **sala de troféus**: todos os troféus da pessoa, de todos os grupos, do mais recente para o mais antigo, com o grupo e a temporada (`GET /me/trophies`). Vale também com a competição do grupo vencida e com o grupo arquivado;
  - no **histórico da pessoa** no grupo (CMP-27), os troféus daquele grupo;
  - na **lista das temporadas** (CMP-34), cada encerrada com o pódio e os destaques.
- **CMP-38. Notificações** (no sino, [NTF](notificacoes.md)):
  - **temporada encerrada:** para cada pessoa do ranking final, "Primavera terminou: você ficou em 4º" (ou "…você foi campeão!"), com o link da aba Competição;
  - **troféu:** para quem recebeu um destaque, "Você foi o mais presente de Primavera";
  - **entrou no pódio:** com a temporada aberta, quando um jogo é fechado ou corrigido e alguém entra nas 3 primeiras posições (estava fora e passou a estar dentro), "Você entrou no pódio de Primavera: 3º". Só ao entrar, não a cada mudança de posição.
  - _Por quê:_ o aviso traz a pessoa de volta para o app. Avisar só ao entrar no pódio evita um aviso por jogo para todo mundo.
- **CMP-39. Os troféus e os avisos saem uma vez só**, junto com o ranking final (CMP-32): no "Encerrar agora", na hora; pela data, no primeiro dos dois: a rotina diária que trava as temporadas cujo prazo passou, ou a primeira leitura depois do prazo.
  - _Por quê:_ quem não abre o app também precisa saber que a temporada acabou, então a trava não pode depender só de alguém abrir. Gravar junto com o ranking final garante que ninguém recebe o troféu duas vezes.

### Edição ao mesmo tempo

- **CMP-42. Toda edição da competição manda a versão que a tela mostrou.** Vale para o regulamento (`PUT .../rules`, a versão da competição), o fechamento do jogo (`PUT .../games/{gameId}`, a versão do fechamento; `0` no 1º fechamento), a partida (editar e apagar) e a temporada (editar e cancelar). Criar uma partida ou uma temporada, começar o teste e encerrar a temporada não mandam versão. Encerrar confere a versão que a api acabou de ler: se alguém editou a temporada no mesmo instante, a resposta também é `VERSION_CONFLICT`. Versão diferente da atual responde `VERSION_CONFLICT` (409, `details.currentVersion`), e nada é gravado. A tela relê o que estava editando, fecha o painel e avisa: "Alguém mudou isto antes de você. Atualizamos; faça a mudança de novo." _(Nova em 2026-11-15.)_
  - _Por quê:_ com cargos, duas pessoas podem editar a mesma coisa ao mesmo tempo. Sem a versão, a segunda gravação apagaria a primeira sem ninguém perceber ([ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)).

### Telas (web)

- **CMP-09. A aba Competição** aparece na página do grupo para membros e reservas quando a competição **não está desativada** ([GRP-29](grupos.md)):
  - no topo, o ranking (CMP-28);
  - abaixo dele, o estado: "Teste até {data}", "Ativa até {data}" ou "Vencida em {data} · só leitura";
  - o regulamento, só leitura: os pontos de cada acontecimento, a unidade e a ordem do desempate;
  - para o organizador, o botão "Mudar regulamento", que abre o mesmo painel dos Ajustes (CMP-10). Não aparece com a competição vencida nem com o grupo arquivado.
  - abaixo, os jogos da competição (CMP-18);
  - _Por quê:_ todos que jogam veem as regras no mesmo lugar onde vão ver o ranking (próximas entregas).
- **CMP-10. A linha Competição nos Ajustes** ([GRP-29](grupos.md)):
  - **Para o dono, com a competição desativada:** "Desativada" → o painel que explica o módulo e tem "Começar teste de 30 dias". Pede confirmação: "O teste dura 30 dias e só pode ser usado uma vez neste grupo." Depois, a página mostra a aba Competição;
  - **Para o organizador, com a competição ativa:** "Teste até {data}" (ou "Ativa até {data}") com o resumo dos pontos ("V 3 · E 2 · D 1 · F −2") → o **painel do regulamento**: os 3 modelos no topo (tocar num preenche os campos), os 6 pontos, a unidade, a ordem do desempate (incluir, tirar e mudar a ordem) e Salvar;
  - **Com a competição vencida** (para o dono e o organizador): "Vencida em {data} · só leitura" → o painel que explica que nada foi apagado e que o plano é liberado pela equipe do scorely (CMP-03).
  - Quem tem `seasons.manage` e não é dono não vê a linha com a competição desativada.
  - Uma ação barrada por `COMPETITION_INACTIVE` mostra a mensagem traduzida e recarrega a competição. As barradas por permissão seguem a GRP-57.
  - _Por quê:_ os Ajustes já são o lugar de configurar o grupo. Ativar é uma decisão de uma vez, e o regulamento é configuração, mesmo que também apareça para leitura na aba Competição.
- **CMP-17. Fechar na aba Jogo:** com um dos próximos jogos já começado (em andamento, ou cancelado com o horário passado) e a competição ativa, quem tem `results.record` vê, na aba Jogo, a **linha Competição**: "Fechar o jogo" (ou "Jogo fechado · corrigir"). Ela abre o **painel de fechar** ([GRP-29](grupos.md)):
  - a chamada: a lista do jogo (dentro e depois fila), cada pessoa com veio / faltou (CMP-12);
  - no modo pelo dia, os times publicados como opções de vencedor, "Empate" e "Sem resultado" (CMP-13, 14: quem veio fica com 0). Sem times publicados, o aviso "Sem times publicados: o jogo fecha só com a chamada";
  - "Amistoso (não vale ponto)" (CMP-15);
  - Salvar. Depois, a linha muda para "Jogo fechado · corrigir".
  - Jogo cancelado: o painel tem só "Fechar como cancelado" (CMP-12).
  - _Por quê:_ fechar na hora, na beira da quadra, é o caso comum. O painel é o mesmo da aba Competição.
- **CMP-18. Os jogos na aba Competição** (CMP-09), abaixo do regulamento:
  - a lista dos jogos desde a ativação (CMP-16), cada um com a data e o estado. Quem tem `results.record` vê "Fechar" nos jogos para fechar e "Corrigir" nos fechados, que abrem o painel de fechar (CMP-17). Com a competição vencida ou o grupo arquivado, ninguém tem os botões;
  - tocar num jogo (menos o cancelado ainda não fechado) abre o detalhe: o resultado ("Time 2 venceu", "Empate" ou "Sem resultado"), a marca de amistoso e cada pessoa com o que aconteceu e os pontos ("veio · Time 2 · +3", "faltou · −2", "não confirmou · 0"), dos membros para os demais.
  - _Por quê:_ o jogo esquecido tem um lugar para ser fechado depois, e todo mundo confere os próprios pontos.
- **CMP-23. As partidas na tela** (unidade por partida):
  - a linha Competição da aba Jogo (CMP-17) passa a abrir, para quem fecha, o **painel do jogo**, com duas partes: **Partidas** e **Fechar** (a chamada, CMP-12);
  - **Partidas:** no topo, o vencedor do dia (ou os empatados) e cada pessoa com "vitórias / partidas"; embaixo, as partidas numeradas, com os dois times e a marca no vencedor (ou "Empate"); "Registrar partida", e em cada partida "Corrigir" e "Apagar" (pede confirmação);
  - **registrar e corrigir** abrem o painel de baixo com a lista do jogo (dentro, depois fila) e os avulsos. Cada pessoa vai para o Time A, para o Time B ou fica de fora, e o resultado é escolhido por último (Time A, Time B ou Empate);
  - **a partida nova já vem com os times da última partida registrada.** Na 1ª, vem com o Time 1 e o Time 2 publicados, se houver; senão, vazia;
  - no detalhe do jogo na aba Competição (CMP-18), as mesmas partidas, o vencedor do dia e, por pessoa, "3 V · 1 E · 1 D" e os pontos. Quem fecha também registra, corrige e apaga ali. Quem não fecha, a competição vencida e o grupo arquivado veem só leitura.
  - _Por quê:_ de uma partida para a outra quase sempre muda um time só. Repetir os times faz o registro levar segundos, no celular, na beira da quadra.
- **CMP-28. O ranking na aba Competição**, no topo, acima do regulamento:
  - o recorte em 3 opções: Geral, Masculino e Feminino;
  - uma linha por membro: a posição (com o empate: "2º" duas vezes), o apelido (USR-04 em [usuarios.md](usuarios.md)), os pontos e, embaixo, "12 presenças · sequência 5";
  - a linha de quem vê fica marcada ("você");
  - tocar numa linha abre o histórico da pessoa (CMP-27), no painel de baixo;
  - sem nenhum jogo fechado, o aviso "O ranking aparece quando o primeiro jogo for fechado", com os membros em 0.
  - _Por quê:_ é a primeira coisa que o grupo quer ver ao abrir a competição.
- **CMP-35. As temporadas na tela:**
  - na aba Competição, acima do ranking, o card da temporada: "Verão 2027 · até 30/01 · faltam 10 dias" (ou "programada: começa 01/02", "no prazo: fechar os jogos até 02/02", ou "Sem temporada");
  - o ranking (CMP-28) ganha a escolha **Temporada** (a aberta ou no prazo) ou **Geral**, e as encerradas numa lista "Temporadas anteriores", cada uma com o pódio e o ranking final ao tocar;
  - nos Ajustes, a linha **Temporadas** (para `seasons.manage`, com a competição ativa) abre o painel: abrir agora ou programar (nome, início e fim, com o regulamento de agora copiado), editar ou cancelar a programada e "Encerrar agora" na aberta (pede confirmação: "A temporada termina hoje e trava os jogos dela. O ranking final não muda mais.").
  - _Por quê:_ quem joga vê na hora qual temporada vale e quanto falta. Abrir e encerrar é configuração, e fica nos Ajustes, como o regulamento.
- **CMP-40. O card do pódio para compartilhar:** em cada temporada encerrada (CMP-35), "Compartilhar" monta uma imagem com o nome do grupo, o nome da temporada, o pódio e os destaques, no visual do app.
  - No celular, abre o compartilhar do sistema (WhatsApp, Instagram...) com a imagem. Onde não dá, baixa a imagem e oferece o texto pronto ("🏆 Primavera · 1º Ana · 2º Caio · 3º Dono e Beatriz") para copiar.
  - _Por quê:_ o pódio vira assunto fora do app, no grupo do WhatsApp, que é onde a pelada conversa.
- **CMP-41. A sala de troféus no perfil** (`/profile`): uma seção com os troféus (o ícone do tipo, "Campeão · Primavera · Vôlei de sexta" e a data). Sem troféus, a seção não aparece.

## 3. Como funciona

### Dados (single-table, sem GSI, ver [`dynamodb.md`](../../.claude/rules/dynamodb.md))

| Item                      | Chave                                                           | Para quê                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Competição do grupo       | `GROUP#<groupId>` / `COMPETITION`                               | `plan` (`trial` ou `paid`), `activeUntil`, `trialStartedAt`, `rules` (o regulamento, CMP-06). Existe só depois do teste (CMP-02)                                                                                                                                                                                                                                                    |
| Fechamento do jogo        | `GAME_RESULT#<gameId>` / `META`                                 | `groupId`, `date`, `startsAt`, e do 1º fechamento: a cópia do regulamento, os membros e as reservas do grupo, e a lista do jogo com quem estava dentro ou na fila (CMP-14). Também: a chamada (`attendance`: veio ou faltou por pessoa), os times publicados copiados com os nomes dos avulsos, o resultado do dia (`winner` = índice do time, ou `draw`), `friendly` e `cancelled` |
| Jogos fechados do grupo   | `LOOKUP#GROUP#<groupId>#GAME_RESULT` / `<startsAt>#<gameId>`    | a lista dos jogos fechados (CMP-16), gravada na mesma transação do fechamento                                                                                                                                                                                                                                                                                                       |
| Temporada                 | `SEASON#<id>` / `META`                                          | `groupId`, `name`, `startDate`, `endDate` (datas locais), `rules` (a cópia, CMP-29), `closedAt` (encerrada antes), `final` (o ranking final guardado ao travar, CMP-32)                                                                                                                                                                                                             |
| Temporadas do grupo       | `LOOKUP#GROUP#<groupId>#SEASON` / `<startDate>#<id>`            | a lista (CMP-34) e a conferência de "uma por vez", gravado na mesma transação                                                                                                                                                                                                                                                                                                       |
| Temporadas que vão travar | `LOOKUP#SEASON#OPEN` / `<endDate>#<id>`                         | a lista que a rotina diária lê (CMP-39, ADR 0012): entra ao criar a temporada, muda junto com o fim e sai na transação do ranking final                                                                                                                                                                                                                                             |
| Troféu                    | `TROPHY#<seasonId>#<userId>#<kind>` / `META`                    | `groupId`, `seasonId`, `kind` (`champion`, `second`, `third`, `attendance`, `streak`), `awardedAt` (CMP-36), gravado na mesma transação do ranking final                                                                                                                                                                                                                            |
| Troféus da pessoa         | `LOOKUP#USER#<userId>#TROPHY` / `<awardedAt>#<seasonId>#<kind>` | a sala de troféus (CMP-37)                                                                                                                                                                                                                                                                                                                                                          |
| Partida                   | `MATCH#<id>` / `META`                                           | `gameId`, `groupId`, `teams` (dois times, ids do sistema ou do avulso), `winner` (`0`, `1` ou `draw`) (CMP-20)                                                                                                                                                                                                                                                                      |
| Partidas do jogo          | `LOOKUP#GAME#<gameId>#MATCH` / `<createdAt>#<id>`               | a ordem das partidas (Partida 1, 2...), gravado na mesma transação da partida                                                                                                                                                                                                                                                                                                       |
| Contagem de partidas      | `MATCHES#<gameId>` / `COUNTERS`                                 | `matchCount`, que muda com `ADD` na mesma transação de registrar e apagar, com a condição `< 30` (CMP-20)                                                                                                                                                                                                                                                                           |

O estado (CMP-01) não é gravado: sai de `activeUntil` comparado com agora. Começar o teste grava o item com a condição de ele ainda não existir, então dois toques ao mesmo tempo não dão dois testes.

Os jogos desde a ativação (CMP-11, 16) saem do lookup dos jogos do grupo (`LOOKUP#GROUP#<groupId>#GAME`, do módulo de grupos), que só tem os jogos que viraram item: jogo sem ninguém não tem o que fechar (CMP-11). Valem os de início entre `trialStartedAt` e agora. A lista dos jogos, os times publicados e o jogo pela data são lidos pelas funções dos módulos de grupos e de times; nada é gravado neles.

O acesso, a permissão e o grupo arquivado são conferidos pelas funções do módulo de grupos (`groups.deps.ts`, GRP-04, 49, 52). A competição lê o grupo; o grupo não lê a competição.

### Onde está cada regra

| Arquivo                                      | O que tem                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/src/competition.ts`               | estados, regulamento, faixa dos pontos, catálogo do desempate e os modelos (CMP-01, 06, 08)                                                                                  |
| `api/.../competition/competition.service.ts` | ativação, teste, só leitura e mudar o regulamento (CMP-01–07)                                                                                                                |
| `api/.../competition/competition.status.ts`  | o estado pela data, num ponto só (CMP-01, 04)                                                                                                                                |
| `api/.../competition/result.service.ts`      | fechar, corrigir e ver os jogos (CMP-11–16)                                                                                                                                  |
| `api/.../competition/scoring.ts`             | os pontos do jogo, puros (CMP-14)                                                                                                                                            |
| `api/.../competition/match.service.ts`       | registrar, corrigir e apagar partidas (CMP-19–21)                                                                                                                            |
| `api/.../competition/ranking.ts`             | o ranking e o histórico, puros (CMP-24–27)                                                                                                                                   |
| `api/.../competition/ranking.service.ts`     | quem vê, quem aparece e o recorte (CMP-24, 25, 27)                                                                                                                           |
| `web/.../competition/`                       | a aba Competição, a linha e os painéis dos Ajustes, o painel de fechar, a linha da aba Jogo, os jogos, as partidas, o ranking e o histórico (CMP-09, 10, 17, 18, 23, 27, 28) |

### Rotas

| Rota                                                                     | Quem             | Regras         |
| ------------------------------------------------------------------------ | ---------------- | -------------- |
| `GET /groups/{id}/competition`                                           | membro/reserva   | CMP-01, 05     |
| `POST /groups/{id}/competition/trial`                                    | dono             | CMP-02         |
| `PUT /groups/{id}/competition/rules`                                     | `seasons.manage` | CMP-04, 06, 07 |
| `GET /groups/{id}/competition/games`                                     | membro/reserva   | CMP-16         |
| `GET /groups/{id}/competition/games/{gameId}`                            | membro/reserva   | CMP-12–16      |
| `PUT /groups/{id}/competition/games/{gameId}`                            | `results.record` | CMP-11–15      |
| `POST /groups/{id}/competition/games/{gameId}/matches`                   | `results.record` | CMP-19–21      |
| `PUT`/`DELETE /groups/{id}/competition/games/{gameId}/matches/{matchId}` | `results.record` | CMP-19–21      |
| `GET /groups/{id}/competition/ranking` (`?gender=M` ou `F`)              | membro/reserva   | CMP-24–26      |
| `GET /groups/{id}/competition/people/{userId}`                           | membro/reserva   | CMP-27         |
| `GET /groups/{id}/competition/seasons`                                   | membro/reserva   | CMP-34         |
| `POST /groups/{id}/competition/seasons`                                  | `seasons.manage` | CMP-29, 30     |
| `PUT`/`DELETE /groups/{id}/competition/seasons/{seasonId}`               | `seasons.manage` | CMP-30         |
| `POST /groups/{id}/competition/seasons/{seasonId}/close`                 | `seasons.manage` | CMP-32         |
| `GET /me/trophies`                                                       | logado           | CMP-37         |
| rotina diária (sem rota)                                                 | —                | CMP-39         |

O `PUT` recebe `{ version, attendance, winner?, friendly }`: a chamada de todos da lista, o vencedor (índice do time ou `draw`, só pelo dia) e o amistoso. Ele fecha (1ª vez) ou corrige. O detalhe do jogo (`GET .../games/{gameId}`) traz também as partidas, o vencedor do dia e, por pessoa, as vitórias, empates e derrotas (CMP-22). A partida (`POST`/`PUT`) recebe `{ teams: [string[], string[]], winner }`, pelo id público ou o do avulso; o `PUT` e o `DELETE` também mandam `version` (CMP-42). O regulamento, o fechamento, a partida e a temporada saem com a `version` de cada um.

Erros: `VERSION_CONFLICT` (409, CMP-42), `COMPETITION_TRIAL_USED`, `COMPETITION_INACTIVE`, `GAME_NOT_STARTED`, `MATCH_INVALID` (422, `details.reason`: `day_unit`, `person_unknown`, `team_empty`, `person_repeated`, `person_absent`; `details.userId?`), `GAME_MATCHES_FULL` (409), `MATCH_NOT_FOUND` (404), `RESULT_INVALID` (inclui `absent_played`) (422, `details.reason`: chamada sem alguém da lista, pessoa fora da lista, vencedor sem times ou fora deles, resultado na unidade por partida, chamada ou vencedor num jogo cancelado), e os do grupo (`GROUP_NOT_FOUND`, `GROUP_NOT_OWNER`, `GROUP_PERMISSION_DENIED`, `GROUP_ARCHIVED`, `GAME_NOT_FOUND`, `GAME_CANCELLED`, `GROUP_MEMBER_NOT_FOUND` (histórico de quem nunca esteve no grupo, CMP-27), `SEASON_INVALID` (422, `details.reason`: `duration`, `past_start`, `too_far`, `overlap`, `started`), `SEASON_NOT_FOUND` (404), `SEASON_CLOSED` (409), `VALIDATION_ERROR`).

## 4. Limites conhecidos

- O ranking e o histórico leem todos os jogos fechados desde a ativação (e as partidas de cada um) a cada vez: até uns 53 jogos num ano. Se pesar, um resumo por jogo entra depois.
- O recorte por gênero usa o perfil de agora: quem muda o gênero muda de recorte, inclusive nos jogos antigos.
- O ranking da aba Competição é lido ao abrir a aba e ao trocar o recorte: fechar ou corrigir um jogo na mesma aba só aparece no ranking ao reabrir.
- O histórico de uma pessoa responde mesmo com a competição desativada (a aba não aparece, CMP-09), com os jogos que houver.
- A rotina diária trava as temporadas uma vez por dia: entre o fim do prazo e a rotina, a trava (e os avisos) também sai na primeira leitura. No dev local não há rotina, só a leitura.
- O card do pódio é montado no aparelho (imagem gerada no navegador). O compartilhar com imagem depende do navegador do celular.
- O ranking final, os troféus e os lookups vão numa transação só, que aceita até 100 itens: uns 48 troféus. Uma temporada com empate demais para isso não trava (a leitura e a rotina falham com erro), e precisa de ajuste à mão.
- O "entrou no pódio" relê os jogos logo depois de gravar, sem leitura consistente: numa leitura atrasada, o jogo recém-fechado pode não entrar na conta, e o aviso não sai.
- Os pontos de uma partida ficam só na partida: corrigir uma partida de um jogo já fechado muda os pontos dele na hora, sem passar pelo fechamento.
- Não há cobrança no app. O plano é liberado pela equipe direto no banco (CMP-03), e ninguém é avisado de que o teste está acabando.
- A aba Competição faz uma leitura a mais ao abrir a página do grupo, porque o grupo não sabe da competição.
- A lista dos jogos lê um lookup por semana desde a ativação: até 53 leituras num ano de competição.
- Quem tivesse só `seasons.manage` veria a aba Ajustes vazia com a competição desativada (GRP-29 mostra a aba, CMP-10 esconde a linha). Hoje não acontece: o único cargo é o Admin, com todas as permissões (GRP-50). Volta a valer com os cargos criados pelo grupo.

## 5. Em discussão (ainda não é regra)

Roteiro aprovado em 2026-11-14, em 6 etapas, cada uma testada no app pelo dono antes da próxima. As 6 etapas (ativação e regulamento, fechar o jogo, partidas, ranking e histórico, temporadas e prêmios) são a seção 2.

Depois: auditoria das correções, campeonatos internos, cobrança no app, rodízio sugerido ("quem ganha fica"), MVP do dia, placar e scout.
