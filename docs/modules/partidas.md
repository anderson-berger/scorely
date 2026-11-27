# Módulo Partidas

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-27.

Código: `apps/scorely/api/src/modules/groups/matches/`, `apps/scorely/web/src/modules/groups/matches/`. Contrato: `apps/scorely/contracts/src/matches.ts`.

## 1. Para que serve

**O grupo reúne as pessoas. A partida reúne as pessoas para jogar. O histórico registra o que aconteceu.** Por isso a partida não apaga nada do que aconteceu nela (PAR-07, 11): o histórico (seção 5) vai ser feito a partir disso.

Tirar a lista do jogo do WhatsApp. Quem organiza cria a partida, manda a mensagem pronta no grupo do WhatsApp, e cada pessoa confirma pelo link. A partida nasce limpa: lista aberta a todos e sem limite de vagas. Quem quiser configura o formato (as vagas) e a abertura da lista, que faz a lista encher em ondas, sozinha, pelo horário: primeiro os membros, depois as reservas e, se ainda sobrar vaga, convidados de fora, só com o nome. A partida pode se repetir toda semana: quando uma termina, a da semana seguinte nasce sozinha, e cada onda que abre avisa quem pode confirmar. Quem organiza divide os times de quem está dentro: sorteia, ajusta à mão e salva, e todos veem o seu time. Na quadra, quem organiza **inicia** a partida, e a lista para de mudar; no fim, **finaliza**, e a partida vai para o histórico. A hora marcada só diz quando a lista abre e fecha: começar e terminar é sempre um toque de quem organiza. Depois de iniciar, quem organiza registra o resultado, do jeito que o grupo decide o dia: **pelo dia** (o time que venceu) ou **por jogo** (cada jogo do rodízio, e vence o dia quem venceu mais). As partidas finalizadas ficam no **histórico** do grupo. _(Alterada em 2026-11-23: entrou a repetição. Alterada em 2026-11-24: entraram os times. Alterada em 2026-11-25: entraram o resultado e o histórico. Alterada de novo em 2026-11-25: iniciar e finalizar passaram a ser à mão, e não mais pela hora.)_

Caso de referência: a Ana cria a partida de sexta, às 19h, toda semana, e configura 2 times de 6 e a abertura da lista. A lista abre para os membros na terça, e eles recebem o aviso. Na quinta ainda faltam 3, e ela abre para as reservas, que recebem o aviso. Na sexta de manhã falta 1, e o Edu pede para trazer o primo, só com o nome. A Ana libera. Cada vez que a lista muda, ela copia a mensagem e cola no WhatsApp. Na sexta à tarde, com a lista fechada, ela sorteia 2 times, troca o Edu e o Carioca de time e salva: cada um vê o seu time na página da partida, e ela copia os times para o WhatsApp. Às 19h10, com todo mundo na quadra, ela toca em **Iniciar partida**. A turma da Ana faz rodízio, e a repetição dela tem o resultado **por jogo**: na beira da quadra, ela registra cada jogo, que já vem com os times do anterior, e só troca quem entrou e saiu. No fim, o Edu venceu 4 dos 5 jogos e venceu o dia. Ela toca em **Finalizar partida**: a da sexta seguinte nasce na hora, com o mesmo formato e a mesma abertura, e a desta semana vai para **Anteriores**, com o resultado.

| Termo        | Significado                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partida      | um jogo do grupo, com dia, hora, duração, formato e lista                                                                                                                                                                  |
| Formato      | quantos times e quantas pessoas por time. As **vagas** são a conta dos dois (2 × 6 = 12). Sem formato, sem limite (PAR-02)                                                                                                 |
| Onda         | quem pode confirmar agora: `members` (membros), `reserves` (membros e reservas) ou `guests` (também convidados). Na tela, a configuração das ondas se chama **Abertura da lista**, e a palavra "onda" não aparece (PAR-03) |
| Lista        | quem disse "vou", na ordem de chegada. Os primeiros, até as vagas, estão **dentro**                                                                                                                                        |
| Fila         | quem disse "vou" com as vagas cheias. Sobe sozinho quando alguém de dentro sai (PAR-09)                                                                                                                                    |
| Não vão      | quem disse "não vou" (os "Ausentes" da lista do WhatsApp)                                                                                                                                                                  |
| Convidado    | alguém de fora do grupo, só com o nome e sem conta, que um participante pediu e quem organiza liberou (PAR-13)                                                                                                             |
| Fechamento   | a hora a partir da qual ninguém mais entra na lista (PAR-04)                                                                                                                                                               |
| Iniciar      | o toque de quem organiza que diz "começou": a lista congela e as configurações travam. Não depende da hora marcada (PAR-41)                                                                                                |
| Finalizar    | o toque de quem organiza que diz "acabou": a partida vai para o histórico e a repetição cria a próxima. Não se desfaz (PAR-43)                                                                                             |
| Repetição    | o molde de uma partida toda semana: o dia da semana, a hora, a duração, o fuso, o formato e a abertura. Ela cria as partidas, uma de cada vez (PAR-20, 21)                                                                 |
| Times        | a divisão de quem está dentro em "Time 1", "Time 2"... A partida tem uma só, que quem organiza salva (PAR-25)                                                                                                              |
| Sorteio      | a sugestão de times que a tela faz ao acaso, para quem organiza ajustar antes de salvar. Não é gravado (PAR-26)                                                                                                            |
| Sem time     | quem está dentro e não está em nenhum time salvo, como quem confirmou depois (PAR-28)                                                                                                                                      |
| Resultado    | o que aconteceu na partida, registrado por quem organiza, **pelo dia** ou **por jogo** (PAR-31)                                                                                                                            |
| Jogo         | no resultado por jogo, cada jogo do rodízio: o **Time A** contra o **Time B**, e quem venceu (PAR-34). Não confundir com a partida, que é o dia inteiro                                                                    |
| Venceu o dia | quem o resultado diz que ganhou a partida: pelo dia, as pessoas do time vencedor; por jogo, quem venceu mais jogos (PAR-33, 34)                                                                                            |
| Histórico    | as partidas do grupo finalizadas ou canceladas, com o resultado (PAR-36)                                                                                                                                                   |
| Vale para    | as competições do grupo em que o resultado da partida soma (PAR-40, [competicao.md](competicao.md))                                                                                                                        |

"Lista de espera", no grupo, são as **reservas** (GRV-17 em [grupos.md](grupos.md)): gente que joga quando sobra vaga. A fila daqui é outra coisa: é quem confirmou com a lista cheia.

## 2. Regras de negócio

### Criar e editar

- **PAR-01. Quem tem `matches.manage` (GRV-15) cria a partida só com o dia, a hora e a duração** (`POST /groups/{publicId}/matches` `{ startsAt, endsAt }`). O resto **nasce vazio** e se configura depois, nas configurações da partida (PAR-06):

  | Campo               | Valores                                                    | Ao criar                                          |
  | ------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
  | Dia, hora e duração | o início no futuro, até 90 dias; a duração de até 24 h     | escolhidos por quem cria                          |
  | Formato             | de 1 a 10 times, de 1 a 50 pessoas por time, até 100 vagas | sem formato: sem limite de vagas (PAR-02)         |
  | Abertura da lista   | PAR-03, 04                                                 | sem configuração: aberta a todos, fecha no início |
  | Resultado           | pelo dia ou por jogo (PAR-31)                              | pelo dia                                          |
  - A tela mostra dia, hora e duração; a api recebe e guarda o início e o fim (UTC, ADR 0006), e o fim é o início mais a duração.
  - Fora disso, `VALIDATION_ERROR` (422). Quem participa e não tem a permissão recebe `GROUP_PERMISSION_DENIED`; quem não participa, `GROUP_NOT_FOUND` (GRV-04).
  - O grupo tem no máximo **20 partidas por vir** (nem finalizadas, PAR-43, nem canceladas, PAR-07). A 21ª responde `MATCH_LIMIT` (409, `details.limit`). A partida que passou da hora e ninguém finalizou continua contando. _(Alterada em 2026-11-25: antes, contavam as que não tinham passado do fim, canceladas incluídas.)_
  - Criar pode pedir para **repetir toda semana** (`repeatWeekly: true`, com o `timeZone` de quem cria): nasce a repetição junto com a partida (PAR-20). _(Nova em 2026-11-23.)_
  - _Por quê:_ o form pede o mínimo: criar a partida de sempre é escolher o dia e a hora. Cada esporte tem um formato (vôlei 2 × 6, futsal 2 × 5, futevôlei 4 × 2), e o grupo não tem esporte: um padrão de vôlei estaria errado para os outros. Por isso nada vem pronto, e a partida limpa funciona como a lista do WhatsApp de hoje: todo mundo confirma, sem limite. O formato já deixa os times prontos para a divisão (próxima etapa). _(Alterada em 2026-11-23: antes, o painel de criar tinha todos os campos, e a partida tinha um local e um recado em texto livre, que saíram (seção 5). Alterada de novo em 2026-11-23: antes, o formato e as ondas nasciam num padrão, 2 × 6 e 72/24/6 h.)_

- **PAR-02. As vagas são times × pessoas por time.** Não há vagas avulsas: para chamar 14 em vez de 12, o formato muda (2 × 7).
  - **Sem formato, não há limite:** todo mundo que diz "vou" está dentro, e não há fila.
  - Configurar o formato depois segue PAR-06: as vagas não ficam abaixo de quem já está dentro. Tirar o formato volta a não ter limite, e a fila inteira entra.
  - _Por quê:_ quem confirma está entrando num time. Vagas que não fecham times deixam a divisão sem solução. Sem formato, o app não inventa um limite que o grupo não pediu. _(Alterada em 2026-11-23: entrou a partida sem formato.)_
- **PAR-03. A abertura da lista diz quando cada um pode confirmar,** em horas antes do início. Cada onda vale até o fechamento, e cada hora é opcional:

  | Onda       | Quem confirma      | Sem a hora configurada                     |
  | ---------- | ------------------ | ------------------------------------------ |
  | Membros    | os membros         | desde a criação                            |
  | Reservas   | membros e reservas | junto com os membros                       |
  | Convidados | também convidados  | junto com as reservas; ou "sem convidados" |
  - **Sem nada configurado, a lista está aberta a todos desde a criação:** membros, reservas e pedidos de convidado (que quem organiza ainda libera, PAR-13). Ela fecha no início.
  - Quem tem `matches.manage` configura nas configurações da partida (PAR-06): as horas que quiser, desligar os convidados ("sem convidados") e o fechamento (PAR-04).
  - De 0 a 336 h (14 dias), na ordem **membros ≥ reservas ≥ convidados ≥ fechamento** (contando só as configuradas). Fora de ordem, `VALIDATION_ERROR` com o campo.
  - A onda é calculada pela hora, ao ler: ela abre na hora exata, sem esperar nenhuma rotina. O aviso de que ela abriu é outra coisa (PAR-24). _(Alterada em 2026-11-23: antes, abrir pela hora não avisava ninguém.)_
  - _Por quê:_ a preferência dos membros é a onda: eles têm a lista só para eles primeiro. Ninguém precisa lembrar de abrir para as reservas, que era a primeira dor de quem organiza. Em horas antes do início, a configuração continua valendo quando a partida muda de dia, e é a mesma que a repetição semanal usa (PAR-20). Sem configurar, a partida funciona como a lista do WhatsApp: quem vê, confirma. "Onda" é palavra nossa; na tela, "Abertura da lista" diz o que é. _(Alterada em 2026-11-23: antes, as ondas nasciam em 72/24/6 h, e a onda de convidados ausente era desligada.)_

- **PAR-04. A lista fecha em horas antes do início** (de 0, sem configurar, até a onda configurada mais tarde). Depois do fechamento, ninguém entra (`MATCH_CLOSED`, 409), mas quem está na lista ainda pode desistir até iniciar (PAR-08, 41).
  - _Por quê:_ quem organiza precisa de um momento em que a lista para de mudar para montar os times. Desistir continua valendo: é melhor saber antes de chegar à quadra.
- **PAR-05. Quem tem `matches.manage` abre a próxima onda antes da hora** (`POST /groups/{publicId}/matches/{matchId}/advance` `{ wave }`, com `wave` = `reserves` ou `guests`). A onda pedida e as anteriores ficam abertas na hora. Abrir uma onda que já está aberta não muda nada. Os convidados abrem assim mesmo com a onda deles desligada. Depois do fechamento, `MATCH_CLOSED`; depois de iniciar (PAR-41), `MATCH_STARTED`. _(Alterada em 2026-11-25: entrou o iniciar.)_
  - Sem a abertura configurada, tudo já está aberto, e não há o que abrir.
  - **Abrir antes não se desfaz:** uma onda aberta, pela hora ou à mão, não fecha mais (PAR-06).
  - Abrir à mão avisa na hora quem a onda deixou confirmar (PAR-24). _(Nova em 2026-11-23.)_
  - _Por quê:_ às vezes a quarta-feira já mostra que os membros não vão fechar. Esperar a hora só atrasa quem quer jogar.
- **PAR-06. Quem tem `matches.manage` muda as configurações da partida** (`PUT /groups/{publicId}/matches/{matchId}` com todas as configurações: o início e o fim, o formato (ou nenhum), a abertura da lista (as horas configuradas, "sem convidados" e o fechamento) e o jeito do resultado (PAR-31), e o `expectedVersion`, [ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)), até iniciar (PAR-41; depois, `MATCH_STARTED`, 409). Passada a hora marcada sem iniciar, as configurações ainda mudam: é assim que se remarca a partida que não aconteceu. _(Alterada em 2026-11-23: antes, "edita a partida", com o local e o recado. Alterada em 2026-11-25: entrou o jeito do resultado. Alterada de novo em 2026-11-25: antes, travava na hora do início.)_
  - Diminuir as vagas abaixo de quem já está dentro responde `MATCH_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed`).
  - Aumentar as vagas faz a fila subir, com o aviso de PAR-09.
  - Mudar a hora não tira ninguém da lista. As ondas acompanham o início (PAR-03), mas **a onda atual nunca volta**: se a edição faria uma onda já aberta fechar (o início foi para depois, ou as horas diminuíram), ela continua aberta (PAR-05).
  - **A primeira configuração da abertura passa a valer:** a lista que estava aberta a todos só por não ter abertura configurada (PAR-03) segue as horas novas. Se ainda não é a hora das reservas, a reserva volta a esperar. Quem já confirmou continua na lista (PAR-09). O "nunca volta" vale para a onda aberta por uma hora configurada ou à mão (PAR-05). _(Nova em 2026-11-23.)_
  - Uma edição que abre uma onda (as horas aumentaram, ou o início ficou mais perto) avisa na hora, como abrir à mão (PAR-24). _(Nova em 2026-11-23.)_
  - Editar uma partida que vem de uma repetição muda só ela, e não a repetição (PAR-22). _(Nova em 2026-11-23.)_
  - _Por quê:_ ninguém que está dentro é tirado da lista por uma edição. Quem confirmou já se programou.
- **PAR-07. Quem tem `matches.manage` cancela a partida** (`POST /groups/{publicId}/matches/{matchId}/cancel`), até iniciar (PAR-41; depois, `MATCH_STARTED`), inclusive depois da hora marcada, para a partida que não aconteceu. Todos da lista (dentro e fila), menos quem cancelou, recebem o aviso `match_cancelled`. A partida cancelada continua nas próximas até o fim do horário marcado, marcada como cancelada, e depois vai para o histórico (PAR-36). Ninguém responde nela nem mexe nos convidados (`MATCH_CANCELLED`, 409). Cancelar de novo não muda nada. _(Alterada em 2026-11-25: antes, só até a hora do início.)_
  - **Cancelar não apaga nada:** a partida só ganha a data de cancelamento, e as respostas e os convidados ficam como estavam. Nenhum item das partidas expira ou é apagado.
  - _Por quê:_ quem ia jogar precisa saber, e a partida que some sem explicação vira pergunta no WhatsApp. O histórico vai precisar saber também das partidas que não aconteceram.
  - Cancelar uma partida de uma repetição cancela só ela: a da semana seguinte nasce na hora, como ao finalizar (PAR-21, 23).

### Iniciar e finalizar

- **PAR-41. Quem tem `matches.manage` inicia a partida** (`POST /groups/{publicId}/matches/{matchId}/start`), **a qualquer hora**, antes ou depois da hora marcada. A partida passa a estar em jogo (`in_progress`, PAR-16). _(Nova em 2026-11-25.)_
  - **Iniciar congela a partida:** a lista não muda mais (PAR-05, 08, 13, 14), as configurações travam (PAR-06), não se cancela (PAR-07) e as ondas não avisam (PAR-24). Os times continuam mudando (PAR-25), e o resultado passa a poder ser registrado (PAR-32).
  - **A hora marcada não inicia nem termina nada:** ela só diz quando a lista abre e fecha (PAR-03, 04), e qual é o dia da partida para a competição (PAR-40, COM-05). Passada a hora sem ninguém iniciar, a partida espera, com a lista fechada (PAR-04), e ainda se edita (PAR-06) ou se cancela (PAR-07).
  - Iniciar de novo não muda nada. Na cancelada, `MATCH_CANCELLED`; na finalizada, `MATCH_FINISHED`.
  - Ninguém é avisado.
  - A resposta é a partida (PAR-16).
  - _Por quê:_ o jogo começa quando a turma chega, não no minuto marcado: às vezes mais cedo, quase sempre mais tarde. Pelo relógio, a lista congelava com gente ainda dizendo "não vou" a caminho, e o resultado não abria se o jogo começasse antes. À mão, quem organiza decide, e testar não depende de esperar a hora (decidido em 2026-11-25).
- **PAR-42. Quem tem `matches.manage` volta a partida iniciada para a lista** (`POST /groups/{publicId}/matches/{matchId}/unstart`), antes de finalizar: ela volta a ser como antes de iniciar, com a lista, as configurações e o cancelar liberados de novo, e a situação volta a sair da hora (PAR-16). _(Nova em 2026-11-25.)_
  - Só sem resultado: com resultado registrado, `MATCH_HAS_RESULT` (409). A partida não iniciada não muda. Na finalizada, `MATCH_FINISHED`.
  - Ninguém é avisado.
  - _Por quê:_ iniciar sem querer (ou cedo demais) não pode deixar a lista travada para sempre. Com resultado, a partida já aconteceu: voltar para a lista deixaria um resultado numa partida que não começou.
- **PAR-43. Quem tem `matches.manage` finaliza a partida iniciada** (`POST /groups/{publicId}/matches/{matchId}/finish`), a qualquer hora, com ou sem resultado. Ela sai das próximas (PAR-15) e vai para o histórico (PAR-36), e, na partida de uma repetição, a da semana seguinte nasce na hora (PAR-21). _(Nova em 2026-11-25.)_
  - **Finalizar não se desfaz.** Os times travam (PAR-25); o resultado e o Vale para continuam mudando (PAR-32, 40).
  - Antes de iniciar, `MATCH_NOT_STARTED` (409). Finalizar de novo não muda nada. Na cancelada, `MATCH_CANCELLED`.
  - **Sem finalizar, a partida espera para sempre:** ela continua nas próximas, conta nas 20 por vir (PAR-01) e, numa repetição, a semana seguinte não nasce. Não há fim automático.
  - Ninguém é avisado.
  - A resposta é a partida (PAR-16).
  - _Por quê:_ quem organiza sabe quando o dia acabou, não o relógio: o jogo que passa da hora não some no meio do rodízio. Sem fim automático, nada acontece sem quem organiza ver (decidido em 2026-11-25). Desfazer o finalizar levaria junto a partida da semana seguinte, que já nasceu e pode já ter gente confirmada.

### Repetir toda semana

- **PAR-20. A repetição é um molde, e cria partidas de verdade.** Ela nasce ao criar a partida com "repetir toda semana" (PAR-01) e guarda:

  | Campo                | De onde vem                                                                           |
  | -------------------- | ------------------------------------------------------------------------------------- |
  | Dia da semana e hora | do início da primeira partida, no fuso da repetição                                   |
  | Duração              | da primeira partida                                                                   |
  | Fuso                 | o de quem cria (o do perfil; sem ele, o do navegador), enviado pela tela (`timeZone`) |
  | Formato e abertura   | nascem vazios, como os da partida (PAR-01); mudam por PAR-22                          |
  | Jeito do resultado   | nasce pelo dia, como o da partida (PAR-01, 31); muda por PAR-22                       |
  | Vale para            | nasce vazio; muda por PAR-22 ou ao abrir uma temporada (PAR-40)                       |
  - Cada partida criada pela repetição é uma partida como as outras: tem a sua lista, os seus convidados, e se edita (PAR-06) e se cancela (PAR-07) sozinha. Ela vem com a repetição de onde saiu (PAR-16).
  - O grupo tem no máximo **10 repetições ativas** (não encerradas, PAR-23). A 11ª responde `MATCH_SERIES_LIMIT` (409, `details.limit`). As partidas delas contam nas 20 por vir (PAR-01).
  - Um fuso que não existe responde `VALIDATION_ERROR`. Sem o `repeatWeekly`, o `timeZone` é ignorado.
  - _Por quê:_ cada semana é uma partida que aconteceu (ou foi cancelada), e é disso que o histórico vai ser feito. O grupo antigo calculava os jogos sem gravar, e o jogo sem registro complicou remarcar, cancelar e o histórico ([arquivo/grupos.md](arquivo/grupos.md), GRP-10). O fuso fica na repetição porque o grupo não tem fuso (GRV-01): "sexta, 19:00" continua sendo sexta, 19:00 na troca do horário de verão ([ADR 0006](../decisions/0006-datas-utc-fuso-do-perfil.md)). Até 10 cobre quem joga terça e quinta, ou duas turmas no sábado.

- **PAR-21. Existe sempre só a próxima partida da repetição.** Quando ela é finalizada (PAR-43) ou cancelada (PAR-07), a seguinte nasce **na hora**, na mesma gravação, com o dia, a hora, a duração, o formato, a abertura, o jeito do resultado e as competições (PAR-40) que a repetição tem naquele momento. _(Alterada em 2026-11-25: entraram as competições. Alterada de novo em 2026-11-25: antes, a seguinte nascia pela hora do fim, por uma rotina ou pela primeira leitura.)_
  - A seguinte cai na semana depois do dia previsto da anterior, no dia e na hora da repetição; se esse momento já passou (a partida foi finalizada dias depois), na primeira semana em que ele ainda está no futuro. Editar o dia de uma partida (PAR-06) não muda o dia das próximas.
  - Ela nasce mesmo com as 20 partidas por vir: ela toma o lugar da que terminou.
  - Enquanto ninguém finaliza nem cancela a partida da semana, a seguinte não nasce (PAR-43).
  - Duas pessoas finalizando ao mesmo tempo nunca criam duas.
  - A lista nunca abre antes de a partida existir: se a onda dos membros é de mais de uma semana, a lista abre quando a partida nasce.
  - _Por quê:_ uma por vez deixa a área Partidas com a próxima de cada dia, sem uma fila de semanas que ninguém vai olhar, e faz a mudança da repetição (PAR-22) valer logo na semana seguinte. Responder "não vou" com semanas de antecedência fica de fora (seção 4).
- **PAR-22. Quem tem `matches.manage` muda a repetição** (`PUT /groups/{publicId}/match-series/{seriesId}` com tudo: o dia da semana, a hora, a duração, o formato (ou nenhum), a abertura da lista, o jeito do resultado (PAR-31), as competições (PAR-40) e o `expectedVersion`, ADR 0016). O fuso não muda. _(Alterada em 2026-11-25: entrou o jeito do resultado. Alterada de novo em 2026-11-25: entraram as competições.)_
  - Os valores seguem PAR-01 a 04.
  - **A mudança vale para as partidas criadas depois dela.** A próxima, que já existe, não muda: ela se edita à parte (PAR-06), e a tela oferece fazer as duas coisas juntas (PAR-18).
  - Uma repetição encerrada responde `MATCH_SERIES_ENDED` (409); uma que não existe, `MATCH_SERIES_NOT_FOUND` (404).
  - _Por quê:_ a próxima pode já estar no WhatsApp, com gente confirmada. Mudar ela por trás, sem quem organiza ver, surpreende. Separar deixa claro o que muda: esta semana, as próximas, ou as duas.
- **PAR-23. Quem tem `matches.manage` encerra a repetição** (`POST /groups/{publicId}/match-series/{seriesId}/end`): ela para de criar partidas. A próxima, que já existe, continua: para tirar, cancela-se ela (PAR-07). Encerrar de novo não muda nada.
  - **Encerrar não se desfaz e não apaga nada:** a repetição ganha a data de encerramento e continua ligada às partidas que criou. Para voltar a repetir, cria-se uma partida com "repetir toda semana" de novo.
  - **Pular uma semana** (feriado) é cancelar a partida daquela semana (PAR-07). A seguinte nasce normalmente quando ela termina.
  - Não há pausa.
  - _Por quê:_ feriado é o caso comum, e cancelar já avisa quem ia jogar. Encerrar sem levar a próxima junto evita cancelar sem querer um jogo que já tem gente confirmada. Sem pausa e sem desfazer, há um jeito só de parar e um de voltar.

### Aviso de lista aberta

- **PAR-24. Quando uma onda abre, quem ela deixou confirmar recebe o aviso `match_list_open`** (o nome do grupo e o link da partida), uma vez por onda em cada partida:

  | Onda que abriu | Quem recebe                  |
  | -------------- | ---------------------------- |
  | Membros        | os membros                   |
  | Reservas       | as reservas                  |
  | Convidados     | ninguém (eles não têm conta) |
  - Só quem ainda não respondeu (PAR-08) recebe. Quem disse "não vou" antes da onda abrir não é avisado.
  - **Quem abriu também recebe:** quem abre à mão (PAR-05) ou por uma edição (PAR-06) e ainda não respondeu recebe o aviso como os outros da onda. É diferente do cancelamento (PAR-07) e dos times (PAR-29), que não avisam quem agiu. _(Nova em 2026-11-24: era o que o código já fazia, sem estar escrito.)_
  - Vale para toda partida, da repetição ou não, e para qualquer jeito de abrir: pela hora (PAR-03), à mão (PAR-05) ou por uma edição (PAR-06). Abrindo várias ondas juntas, cada pessoa recebe um aviso só.
  - **A partida criada por uma pessoa não avisa ao nascer:** as ondas abertas na criação (sem abertura configurada, todas) contam como já avisadas, porque quem cria manda a mensagem no WhatsApp (PAR-19). A partida que a repetição cria (PAR-21) avisa ao nascer as ondas que já estão abertas.
  - A primeira configuração da abertura (PAR-06), que faz uma onda voltar a esperar, faz ela avisar de novo quando abrir.
  - Pela hora, o aviso sai por uma rotina a cada 15 min: chega até 15 min depois de a onda abrir. À mão ou por edição, sai na hora. A partida cancelada, ou iniciada (PAR-41), não avisa. _(Alterada em 2026-11-25: antes, "que já começou" pela hora.)_
  - _Por quê:_ "lembrar de abrir a lista" e avisar o grupo era a primeira dor de quem organiza. Com a repetição, ninguém cria a partida, então alguém precisa avisar que a lista abriu. O convidado não tem onde receber. Quem já respondeu não precisa do aviso, e quem cria a partida na mão já vai mandar a mensagem: avisar seria repetir. Quem abriu e não respondeu recebe porque o aviso é o lembrete de responder: abrir a lista não é dizer "vou". Cancelar e salvar os times não pedem nada de quem agiu, por isso lá o aviso seria só um eco.

### Confirmar

- **PAR-08. Quem participa do grupo responde "vou" ou "não vou"** (`PUT /groups/{publicId}/matches/{matchId}/attendance` `{ status }`, com `going` ou `not_going`):
  - "Vou" só com a onda da pessoa aberta: o membro a partir da onda dos membros, a reserva a partir da onda das reservas. Sem a abertura configurada, as duas estão abertas desde a criação (PAR-03). Antes, `MATCH_NOT_OPEN_FOR_YOU` (409, `details.opensAt`). Depois do fechamento, `MATCH_CLOSED`.
  - "Não vou" vale a qualquer momento até iniciar (PAR-41), mesmo antes da onda da pessoa abrir e depois da hora marcada.
  - Mudar de "vou" para "não vou" tira a pessoa da lista até iniciar, mesmo depois do fechamento. Depois de iniciar, nenhuma resposta muda (`MATCH_STARTED`). _(Alterada em 2026-11-25: antes, até a hora do início.)_
  - Responder o mesmo de novo não muda nada, nem a posição. Quem sai e volta para o "vou" vai para o fim da lista.
  - Quem não respondeu não aparece em nenhuma lista.
  - _Por quê:_ "não vou" cedo é o que quem organiza mais quer saber, e é o que hoje vira a lista de ausentes. Voltar para o fim é justo com quem confirmou no meio.
- **PAR-09. A ordem é de chegada, e ninguém é tirado de dentro.** Quem disse "vou" primeiro fica com a vaga, seja membro, reserva ou convidado. Com as vagas cheias, quem confirma vai para a fila, também por chegada, mesmo sendo membro.
  - **A lista é uma ordem só, calculada a cada leitura:** as respostas "vou" de quem ainda participa (PAR-10) e os convidados liberados (PAR-13), juntos, pela **hora de chegada** (a hora do servidor em que a pessoa disse "vou", ou em que o convidado foi liberado) e, na mesma hora, pelo id (o do usuário ou o do convidado, como texto). As primeiras posições, até as vagas, estão **dentro**; as outras, na **fila**, na mesma ordem. Não há campo de situação nem contador de vagas.
  - Por isso as vagas nunca passam do limite, mesmo com muita gente confirmando ao mesmo tempo: cada um ganha uma posição, e as vagas só cortam a ordem.
  - Quando alguém de dentro sai (PAR-08, 14) ou as vagas aumentam (PAR-06), os primeiros da fila passam a estar dentro, sem nenhuma gravação a mais. Quem passou a estar dentro recebe o aviso `match_promoted`, com o link da partida. O convidado não recebe: ele não tem conta.
  - Exemplo: os membros abrem 72 h antes e as reservas, 24 h antes. Um membro que não respondeu e diz "vou" 10 h antes chega naquela hora: com vaga sobrando, ele está dentro; com as vagas cheias, ele é o último da fila, atrás das reservas que confirmaram antes dele. Ninguém sai de dentro para dar a vaga a ele.
  - _Por quê:_ é previsível ("confirmei, estou dentro"). A preferência do membro já foi a onda (PAR-03): tirar uma reserva que confirmou para dar a vaga a um membro atrasado causa briga.
- **PAR-10. Quem sai do grupo, ou é removido, some das listas das partidas** (GRV-30, 31), e a fila sobe. A resposta dele fica guardada, mas não conta.
  - Esse subir não avisa ninguém (seção 4).
  - **Quem volta** (GRV-30) começa sem resposta: a resposta dada antes da data de entrada atual não conta e não aparece como dele. Para entrar na lista, ele responde de novo e vai para o fim, pela hora da nova resposta (PAR-09). _(Nova em 2026-11-26.)_
  - _Por quê:_ quem não participa mais não ocupa vaga. Ignorar ao ler evita que sair do grupo tenha que mexer em cada partida. Sem a regra da volta, sair e entrar de novo devolvia a posição antiga e passava a pessoa na frente de quem confirmou enquanto ela estava fora.

### Convidados

- **PAR-11. O convidado passa por situações, e só uma delas o põe na lista:**

  | Situação   | Quando                                     | Na lista? | Conta no limite? |
  | ---------- | ------------------------------------------ | --------- | ---------------- |
  | `pending`  | alguém pediu (PAR-12) e ninguém decidiu    | não       | sim              |
  | `approved` | quem tem `matches.manage` liberou (PAR-13) | **sim**   | sim              |
  | `declined` | quem tem `matches.manage` recusou (PAR-13) | não       | não              |
  | `removed`  | saiu da lista depois de liberado (PAR-14)  | não       | não              |
  - Só se passa de `pending` para uma das outras, e de `approved` para `removed`. Nada volta: para trazer de novo, faz-se um pedido novo.
  - Os convidados recusados e removidos continuam guardados, com quem decidiu e quando (PAR-07). O pedido de que a pessoa desistiu (PAR-14) é apagado. _(Alterada em 2026-11-26: antes, ficava guardado como `cancelled`.)_
  - _Por quê:_ pedir não é jogar. Separar as situações deixa a lista, o limite e o histórico contarem cada uma do jeito certo. O pedido desistido não diz nada do que aconteceu: ninguém decidiu nada sobre ele. Guardado, pedir e desistir em sequência enchia a partida de itens que toda leitura dela carregava.

- **PAR-12. Com a onda de convidados aberta (sem configuração, desde a criação, PAR-03), quem participa pede para trazer um convidado** (`POST /groups/{publicId}/matches/{matchId}/guests` `{ name }`): só o nome, de 1 a 40 caracteres, sem os espaços das pontas. O convidado não tem conta e não entra no grupo. Antes da onda, ou com "sem convidados", `MATCH_NOT_OPEN_FOR_YOU`; depois do fechamento, `MATCH_CLOSED`. Quem pede não precisa ter dito "vou".
  - **Sem repetir:** a partida não tem dois convidados `pending` ou `approved` com o mesmo nome (sem diferenciar maiúsculas, acentos e espaços repetidos). O repetido responde `MATCH_GUEST_DUPLICATE` (409). Um nome recusado, cancelado ou removido pode ser pedido de novo.
  - **Limite:** cada partida tem no máximo **30 convidados** `pending` ou `approved`. O 31º responde `MATCH_GUEST_LIMIT` (409, `details.limit`). O nome repetido e o limite são conferidos dentro da própria gravação: dois pedidos ao mesmo tempo nunca passam dos 30 nem repetem o nome.
  - Quem tem `matches.manage` recebe o aviso `match_guest_requested`, com o link da partida. Quem tem a permissão e pede já cria o convidado `approved`, sem aviso.
  - _Por quê:_ o membro conhece o amigo e cadastra o nome; quem organiza decide se ele joga. Sem conta, o convidado não precisa instalar nada para completar o time. O nome repetido é quase sempre o mesmo amigo pedido por duas pessoas.
- **PAR-13. Quem tem `matches.manage` libera** (`POST .../guests/{guestId}/approve`) **ou recusa** (`POST .../guests/{guestId}/decline`) um pedido `pending`. Liberado, o convidado entra na lista como se tivesse dito "vou" naquele instante (PAR-09). Recusado, sai sem aviso. Liberar pede a onda de convidados aberta e a lista não fechada (PAR-04); recusar vale até iniciar (PAR-41).
  - Decidir um pedido que não está mais `pending` (outro já decidiu) responde `MATCH_GUEST_NOT_PENDING` (409, `details.status`). Um id que não existe, ou de um pedido de que a pessoa desistiu, responde `MATCH_GUEST_NOT_FOUND` (404).
  - _Por quê:_ a posição é a da liberação, e não a do pedido, para o convidado não passar na frente de quem confirmou enquanto ele esperava.
- **PAR-14. Tirar o convidado** (`DELETE .../guests/{guestId}`), até iniciar (PAR-41):
  - um `pending`, só quem pediu: o pedido é apagado (PAR-11);
  - um `approved`, quem pediu ou quem tem `matches.manage`: vira `removed`, e a fila sobe (PAR-09).
  - Os outros recebem `GROUP_PERMISSION_DENIED`; um convidado que já saiu, `MATCH_GUEST_NOT_PENDING` com a situação.

### Times

- **PAR-25. Quem tem `matches.manage` salva os times da partida** (`PUT /groups/{publicId}/matches/{matchId}/teams` `{ teams, expectedVersion }`). `teams` é a lista dos times, na ordem ("Time 1", "Time 2"...), e cada time é a lista das pessoas: o id público de quem tem conta ou o id do convidado. _(Nova em 2026-11-24.)_
  - De **2 a 10 times**. Cada pessoa fica em um time só, e só entra num time quem está **dentro** agora (PAR-09): membro, reserva ou convidado liberado. Quem está dentro e não foi posto em nenhum time fica **sem time**. Um time pode ficar vazio.
  - A partida tem uma divisão só: salvar de novo troca a anterior inteira. Não há apagar: para refazer, sorteia-se e salva-se de novo.
  - Salvar manda a `version` dos times que a tela mostrou (0 quando ainda não há times, [ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)); outra responde `VERSION_CONFLICT`.
  - Vale até finalizar (PAR-43), inclusive durante o jogo. Depois, `MATCH_FINISHED` (409); na cancelada, `MATCH_CANCELLED`. _(Alterada em 2026-11-25: antes, até a hora do fim.)_
  - Uma pessoa repetida, ou um número de times fora de 2 a 10, responde `VALIDATION_ERROR`. Alguém que não está dentro (saiu enquanto a tela estava aberta, ou nunca esteve) responde `MATCH_TEAM_PLAYER_OUT` (409, `details.players`: as pessoas como foram enviadas, `{ kind, id, name }`), e nada é gravado.
    - **O nome de quem saiu:** `name` é o apelido de quem tem conta (USR-13) ou o nome do convidado, achado pela api, mesmo de quem a tela nunca teve na lista. Só falta quando o id não é de ninguém (ou a pessoa não tem mais perfil). _(Nova em 2026-11-24.)_
    - _Por quê:_ a tela avisa "Fulano saiu da lista" com os nomes que ela já tinha; quem nunca esteve nela (o id veio de outra aba, por exemplo) saía sem nome no aviso. Quem sabe o nome é a api.
  - A resposta é a partida (PAR-16), já com os times.
  - O número de times não depende do formato (PAR-02): o formato só dá o número que a tela sugere (PAR-26).
  - _Por quê:_ dividir à mão tentando equilibrar era uma das dores de quem organiza. Durante o jogo ainda se troca gente (alguém chegou, alguém se machucou). Quem está na fila não joga, por isso fica fora (seção 4). O formato é o que o grupo combinou para a lista, mas no dia, com 11 dentro numa partida de 2 × 6, os times continuam sendo 2: por isso a divisão guarda o próprio número.
- **PAR-26. O sorteio é uma sugestão da tela, e só vale o que se salva.** Na tela de dividir (PAR-30), quem organiza escolhe o número de times (começa no do formato, ou em 2 sem formato ou com 1 time) e sorteia: a tela espalha ao acaso todos de dentro, com os times de tamanhos que diferem em no máximo 1. Depois, ajusta à mão, trocando as pessoas de time, e salva (PAR-25). Sortear de novo dá outro resultado (é sorte: pode repetir).
  - Nada é gravado antes de salvar: os outros só veem os times salvos, e sair da tela sem salvar descarta o sorteio.
  - Sortear de novo, com times já salvos, só muda a tela: os times salvos continuam valendo até salvar.
  - _Por quê:_ o sorteio resolve "quem fica com quem" sem discussão, e o ajuste resolve o que o sorteio não sabe (os dois melhores no mesmo time). Sem um rascunho gravado, não há "rascunho" e "publicado" para explicar: o que está salvo é o que todos veem. Equilibrar pelo histórico vem depois do resultado (seção 5).
- **PAR-27. Todos que veem a partida veem os times salvos** (PAR-16): cada time com as pessoas, na ordem salva, com o perfil (ou o nome do convidado) e a participação, como nas listas. Sem times salvos, a partida vem sem times.
  - A partida que nasce de uma repetição (PAR-21) nasce sem times: os times não passam de uma semana para a outra.
  - Os times de uma partida finalizada ou cancelada ficam guardados, como tudo da partida (PAR-07): são eles que a tela do resultado sugere (PAR-39). _(Alterada em 2026-11-25.)_
- **PAR-28. Os times não mudam sozinhos quando a lista muda.** Quem estava num time e não está mais dentro (disse "não vou", saiu do grupo, ou o convidado foi tirado) continua no time, com a marca **saiu da lista**, para todos. Quem passou a estar dentro depois de salvar (confirmou, subiu da fila, convidado liberado) fica **sem time**.
  - **Quem não tem mais perfil** (ou o convidado cujo registro não existe mais, ou o convidado de quem não tem mais perfil) também continua no time, como **Pessoa removida**, com a mesma marca **saiu da lista**. Ele conta como quem saiu: a tela de dividir começa sem ele (PAR-30), e a mensagem dos times não o inclui (PAR-19). Hoje nada apaga um perfil nem um convidado; a regra vale para quando isso existir. _(Nova em 2026-11-24: antes, ele sumia do time sem marca.)_
    - _Por quê:_ um time que encolhe sem explicação parece erro; com a marca, quem organiza vê que falta alguém e decide, como com quem saiu da lista.
  - Para mudar, quem organiza abre a tela de dividir: ela já começa com os times salvos, sem quem saiu, e com quem está sem time à parte (PAR-30).
  - _Por quê:_ mexer nos times pelas costas de quem organiza seria pior do que mostrar o que mudou. No dia do jogo, "o Fulano saiu do Time 2" é exatamente o que ele precisa ver para decidir.
- **PAR-29. Os times salvos pela primeira vez avisam quem está neles** (`match_teams_ready`, com o link da partida): quem tem conta e está num time, menos quem salvou. Salvar de novo não avisa.
  - _Por quê:_ todo mundo quer saber em que time está, mas cada troca pequena virando aviso seria barulho. Quem precisa saber de uma troca de última hora fica sabendo pela mensagem dos times no WhatsApp (PAR-19).

### Resultado

- **PAR-31. O resultado se registra de um de dois jeitos:** _(Nova em 2026-11-25.)_

  | Jeito              | O que se registra                                                                    | Venceu o dia                |
  | ------------------ | ------------------------------------------------------------------------------------ | --------------------------- |
  | Pelo dia (`day`)   | os times do dia e qual venceu, ou empate (PAR-33)                                    | as pessoas do time vencedor |
  | Por jogo (`games`) | os jogos do rodízio, na ordem, cada um com o Time A, o Time B e quem venceu (PAR-34) | quem venceu mais jogos      |
  - **O jeito é uma configuração da partida** (PAR-01, 06) **e da repetição** (PAR-20, 22), como o formato. A partida nasce **pelo dia**.
  - A configuração só diz como a tela do resultado abre (PAR-39). Quem registra pode trocar de jeito ali, porque a configuração não muda mais depois de iniciar (PAR-06). O resultado guarda o próprio jeito: registrar de um jeito troca o resultado inteiro, inclusive o que estava no outro.
  - _Por quê:_ cada grupo decide o dia de um jeito. Quem joga um jogo só, ou decide no fim "quem ganhou hoje", registra um toque. Quem faz rodízio (uns 5 jogos, e ganha quem venceu mais) precisa registrar jogo a jogo. Na repetição, a escolha é feita uma vez. Poder trocar na hora salva o grupo que esqueceu de configurar antes de começar.

- **PAR-32. Quem tem `matches.manage` registra o resultado** (`PUT /groups/{publicId}/matches/{matchId}/result` `{ mode, ..., expectedVersion }`) **depois de iniciar a partida (PAR-41), sem prazo,** também depois de finalizar (PAR-43). _(Nova em 2026-11-25. Alterada de novo em 2026-11-25: antes, a partir da hora do início.)_
  - Antes de iniciar, `MATCH_NOT_STARTED` (409). Na cancelada, `MATCH_CANCELLED`.
  - A partida tem um resultado só: registrar de novo troca o anterior inteiro. É assim que se corrige, inclusive semanas depois.
  - Salvar manda a `version` do resultado que a tela mostrou (0 quando ainda não há resultado, ADR 0016); outra responde `VERSION_CONFLICT`.
  - Não há apagar: o resultado errado se corrige.
  - Ninguém é avisado.
  - A resposta é a partida (PAR-16), já com o resultado.
  - Por enquanto não há chamada: quem está no resultado jogou, e quem não está não tem registro. Faltar não se marca (seção 5).
  - _Por quê:_ quem esquece de anotar não perde o dia, e o erro descoberto depois ainda se corrige (decidido em 2026-11-10). Registra quem já cria a partida e divide os times: não há uma permissão nova para explicar. Sem apagar, o histórico não perde o que aconteceu (PAR-07). O aviso fica para quando o resultado der pontos (seção 5).

- **PAR-33. Pelo dia,** o resultado é `{ mode: 'day', teams, winner }`. `teams` são os times, como em PAR-25 (de 2 a 10, cada pessoa em um só). `winner` é o número do time que venceu (1, 2...) ou `draw` (empate). _(Nova em 2026-11-25.)_
  - Entra nos times quem está na **lista**, dentro ou na fila (PAR-09): membro, reserva ou convidado liberado. Quem não está responde `MATCH_TEAM_PLAYER_OUT`, como em PAR-25.
  - Uma pessoa repetida, um número de times fora de 2 a 10 ou um `winner` maior que o número de times responde `VALIDATION_ERROR`. O time vencedor não pode estar vazio.
  - Os times do resultado são do resultado: salvar os times da partida depois (PAR-25) não muda o resultado, e o resultado não muda os times salvos. A tela começa nos times salvos (PAR-39).
  - **Venceram o dia** as pessoas do time vencedor. No empate, ninguém venceu.
  - _Por quê:_ o resultado é o registro do que aconteceu. Ele leva os times junto para não mudar quando os times mudam, e para funcionar depois de finalizar, quando os times não se salvam mais (PAR-25). A fila entra porque, no dia, quem estava na fila joga no lugar de quem não veio, e depois de iniciar a lista não muda mais (PAR-08).

- **PAR-34. Por jogo,** o resultado é `{ mode: 'games', games }`: os jogos, na ordem (Jogo 1, Jogo 2...), cada um `{ teams: [timeA, timeB], winner }`, com `winner` `a`, `b` ou `draw`. _(Nova em 2026-11-25.)_
  - De **1 a 30 jogos**. Cada jogo tem dois times, com pelo menos 1 pessoa cada, e ninguém está nos dois. Os times não precisam ter o mesmo tamanho. Quem não está no jogo ficou de fora dele.
  - Entra quem está na lista, dentro ou na fila, como em PAR-33. Os erros também são os de PAR-33.
  - **A contagem** de cada pessoa que jogou: os jogos, as vitórias, os empates e as derrotas.
  - **Venceu o dia** quem tem mais vitórias, se tiver pelo menos uma. Com empate nas vitórias, todos os empatados. Só com empates nos jogos, ninguém venceu.
  - O convidado entra nos jogos, na contagem e pode vencer o dia.
  - _Por quê:_ no rodízio nem todo mundo joga todos os jogos, e os times mudam de um para o outro. Só os times de cada jogo dizem quem ganhou e quem perdeu. É assim que o grupo de referência decide o dia. O convidado jogou, então conta no dia; no ranking, não conta ([competicao.md](competicao.md), COM-06).

- **PAR-35. Todos que veem a partida veem o resultado** (PAR-16): o jeito, os times de cada jogo (ou do dia) com as pessoas, quem venceu cada um, a contagem (por jogo), quem venceu o dia e a `version` (para PAR-32). Cada pessoa vem com o perfil, como nos times (PAR-27). Quem saiu do grupo depois continua no resultado: ela jogou. Quem não tem mais perfil vem como **Pessoa removida** (PAR-28). Sem resultado, a partida vem sem ele. _(Nova em 2026-11-25.)_

### Histórico

- **PAR-36. Quem participa do grupo vê as partidas que já terminaram** (`GET /groups/{publicId}/matches/history?cursor=`), da mais recente para a mais antiga pela hora marcada, em páginas de **20**: as finalizadas (PAR-43), a qualquer hora em que foram finalizadas, e as canceladas que passaram do fim do horário marcado (PAR-07). Cada uma vem com o dia, a hora, a duração, a situação (`finished` ou `cancelled`), quantos estavam dentro, se tem resultado e quem venceu o dia (PAR-33, 34). _(Nova em 2026-11-25. Alterada de novo em 2026-11-25: antes, as que passaram do fim.)_
  - A partida que passou da hora e não foi finalizada não está no histórico: ela continua nas próximas (PAR-15).
  - Abrir uma partida do histórico é a mesma página da partida (PAR-16, 18), com o resultado (PAR-35).
  - As listas da partida que terminou são as de agora (PAR-09, 10): quem saiu do grupo depois sai das listas, mas continua no resultado (PAR-35).
  - Quem participa vê todo o histórico, inclusive de antes de entrar no grupo. Quem saiu do grupo não vê mais (GRV-04).
  - _Por quê:_ "o histórico registra o que aconteceu" (seção 1): é ele que faz o grupo continuar abrindo o app depois da lista, e é dele que o ranking e o sorteio equilibrado vão sair (seção 5).

### Vale para

- **PAR-40. A partida e a repetição dizem para que competição valem** (o "Vale para", `competitionIds`): até **3** competições do grupo ([competicao.md](competicao.md), COM-05). A partida soma no ranking de cada uma delas quando tem resultado. _(Nova em 2026-11-25.)_
  - **A partida avulsa nasce valendo para nada.** A partida que nasce de uma repetição leva as competições da repetição que ainda estão abertas e cujo período tem o início dela (PAR-21).
  - **Na partida:** `PUT /groups/{publicId}/matches/{matchId}/competitions` `{ competitionIds, expectedVersion }` (a `version` da partida, ADR 0016), por quem tem `matches.manage`, **também depois de iniciar e de finalizar** (PAR-41, 43), enquanto as competições tocadas (as que entram e as que saem) não travaram (COM-11). Uma que não existe responde `COMPETITION_NOT_FOUND`; uma travada, `COMPETITION_LOCKED`; uma cujo período não tem o início da partida, `MATCH_OUTSIDE_COMPETITION` (422, `details.competitionId`). Na partida cancelada, `MATCH_CANCELLED`. Repetida ou mais de 3, `VALIDATION_ERROR`.
  - **Na repetição:** as competições entram no `PUT` da repetição (PAR-22), com a mesma conferência de existir e não estar travada, e valem para as partidas criadas depois dela. Abrir uma temporada também marca as repetições escolhidas e a próxima partida delas (COM-01).
  - Ninguém é avisado.
  - _Por quê:_ nem toda partida é de campeonato: a avulsa, a festa ou a turma de outro dia ficam de fora, e é quem organiza a partida que sabe (decidido em 2026-11-25). A escolha fica na partida, e não numa lista da competição, porque a partida da semana nasce sozinha da repetição e já precisa nascer valendo. Mudar depois do início cobre quem esqueceu de marcar antes do jogo, que é quando se percebe.

### Ver

- **PAR-15. Quem participa do grupo vê as próximas partidas** (`GET /groups/{publicId}/matches`): as que não foram finalizadas (PAR-43), inclusive as que passaram da hora, e as canceladas até o fim do horário marcado (PAR-07), pelo início marcado. _(Alterada em 2026-11-25: antes, as que não tinham passado do fim.)_ Cada uma vem com o dia, a hora, a duração, o formato (quando há), a situação (PAR-16), quantos estão dentro, a resposta de quem pede e, quando vem de uma repetição ativa, o dia da semana dela. _(Alterada em 2026-11-23: entrou a repetição.)_
- **PAR-16. Quem participa do grupo vê a partida** (`GET /groups/{publicId}/matches/{matchId}`): os campos de PAR-01, a situação, as ondas com a hora de cada uma, e as listas **dentro**, **fila** e **não vão**, cada pessoa com o perfil (id público, apelido e foto, USR-13) e a participação (membro ou reserva), e cada convidado com o nome e quem o trouxe. Os pedidos de convidado que esperam vêm só para quem tem `matches.manage` e para quem pediu.
  - **A hora de cada onda:** a da abertura configurada (PAR-03) ou, se ela abriu antes dessa hora (à mão, PAR-05, ou porque uma edição a manteve aberta, PAR-06), a hora em que abriu de fato. Essa hora fica guardada e não muda mais entre uma leitura e outra. _(Nova em 2026-11-24: antes, a onda aberta antes da hora vinha com a hora da leitura, que mudava a cada vez.)_
    - _Por quê:_ "a hora de cada uma" tem que ser uma hora só. Quem lê duas vezes, ou duas pessoas lendo, precisam ver a mesma coisa, e o histórico (seção 5) vai querer saber quando a lista abriu.
  - A situação: `cancelled` (PAR-07), `finished` (finalizada, PAR-43), `in_progress` (iniciada, PAR-41) e, antes de iniciar, pela hora: `scheduled` (antes da onda dos membros, só com a hora dela configurada), `open` (com a onda atual) e `closed` (depois do fechamento, inclusive depois da hora marcada, esperando iniciar). Vêm também a hora em que foi iniciada e a em que foi finalizada, quando houver. _(Alterada em 2026-11-25: antes, `in_progress` e `finished` saíam da hora do início e do fim.)_
  - Vem também o que quem pede pode fazer agora: responder, pedir convidado, e o que a permissão libera (iniciar, voltar para a lista e finalizar, PAR-41–43, e registrar o resultado, PAR-32, entre elas).
  - A partida de uma repetição vem com ela: o id, o dia da semana, a hora, a duração, o fuso, o formato, a abertura, se está encerrada e a `version` (para PAR-22). _(Nova em 2026-11-23.)_
  - Com times salvos, vêm os times (PAR-27), cada pessoa com a marca de quem saiu da lista (PAR-28) e quem não tem mais perfil como pessoa removida (PAR-28), quem está sem time e a `version` dos times (para PAR-25). _(Nova em 2026-11-24.)_
  - Com resultado, vem o resultado (PAR-35). _(Nova em 2026-11-25.)_
  - Vem para que competições ela vale (PAR-40), cada uma com o id e o nome, e a repetição vem com as dela. _(Nova em 2026-11-25.)_
  - Uma partida que não existe responde `MATCH_NOT_FOUND` (404). Quem não participa do grupo recebe `GROUP_NOT_FOUND`, como em GRV-04.
  - _Por quê:_ todo mundo vê a mesma lista que hoje está no WhatsApp, com a diferença de quem está dentro e quem está na fila.

### Telas (web)

- **PAR-17. A área Partidas** (`/groups/{publicId}/matches`, na barra do grupo, GRV-13) lista as próximas partidas (PAR-15) em cartões: o dia e a hora, "10 de 12" (ou "10 confirmados", sem formato) e a resposta de quem vê ("Você vai", "Você está na fila", "Você não vai" ou nada). Quem tem `matches.manage` vê **Criar partida**, que abre um painel de baixo com três campos: **Dia**, **Hora** e **Duração** livre, em horas e minutos (ex.: 1 h 45), de 1 min até 24 h, que começa em 2 h, e o botão de ligar **Repetir toda semana**, desligado, que, ligado, mostra "Toda sexta às 19:00" pelo dia e pela hora escolhidos (PAR-20). Criada, a pessoa vai para a página da partida. A partida de uma repetição ativa tem, no cartão, a marca "Toda sexta". _(Alterada em 2026-11-23: entrou repetir toda semana.)_ _(Alterada em 2026-11-23: antes, o painel tinha todos os campos de PAR-01. Alterada de novo em 2026-11-23: a duração era de 30 em 30 min, e um grupo que joga 1 h 45 não cabia. Saíram também os atalhos 1 h, 1 h 30, 2 h e 3 h: só os dois campos.)_
  - No topo, **Próximas** e **Anteriores** (PAR-37). Ela abre em Próximas. _(Nova em 2026-11-25.)_
- **PAR-18. A página da partida** (`/groups/{publicId}/matches/{matchId}`, o link que vai no WhatsApp) mostra:
  - o dia, a hora e a abertura em uma linha ("Lista aberta para membros · reservas a partir de qui, 19:00"; sem configuração, "Lista aberta"). Passada a hora marcada sem iniciar, "Aguardando o início"; iniciada, **Em jogo**; finalizada, **Finalizada** (PAR-41, 43);
  - os botões **Vou** e **Não vou**, com a resposta atual marcada, e **Trazer convidado** quando a onda de convidados está aberta;
  - depois de iniciar, a seção **Resultado**, antes dos Times (PAR-38). _(Nova em 2026-11-25. Alterada de novo em 2026-11-25: antes, a partir da hora do início.)_
  - com times salvos, a seção **Times**, antes das listas: cada time com o número de pessoas e as pessoas, o time de quem vê marcado como **Seu time**, a marca **saiu da lista** (PAR-28) e, embaixo, **Sem time** quando há alguém (PAR-27, 28). _(Nova em 2026-11-24.)_
  - as listas **Confirmados (10 de 12)** (sem formato, **Confirmados (10)**), **Fila** e **Não vão**, numeradas, com a marca "reserva" e "convidado de Fulano";
  - para quem tem `matches.manage`: os pedidos de convidado com **Liberar** e **Recusar**, **Abrir para as reservas agora** ou **Abrir para convidados agora** (PAR-05), **Dividir times** (ou **Mudar times**, com times salvos; até finalizar, PAR-25, 30), **Registrar resultado** (ou **Corrigir resultado**; depois de iniciar, sem prazo, PAR-32, 39), as **Configurações da partida** e **Cancelar partida**, com confirmação.
  - **Iniciar partida**, em destaque, para quem tem `matches.manage`, até iniciar, a qualquer hora, com confirmação ("A lista e as configurações travam. Dá para voltar enquanto não houver resultado."). Iniciada, no lugar dele, **Finalizar partida**, com confirmação ("Não dá para desfazer." e, numa repetição, "A partida da próxima semana já é criada."), e, sem resultado, **Voltar para a lista** (PAR-41–43). Depois de iniciar, sobram os times (até finalizar), o resultado e o Vale para. _(Alterada em 2026-11-25: entraram iniciar, finalizar e voltar para a lista.)_
  - **Configurações da partida** é uma lista agrupada, como as Configurações do grupo (GRV-14): cada linha tem o nome, o valor atual e a seta, e tocar abre um painel de baixo só com aquilo (PAR-06):

    | Linha             | Valor atual                                                                            | O painel                                                                                                                            |
    | ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
    | Dia e hora        | "sex, 27/11 · 19:00 · 2 h"                                                             | dia, hora e duração, como no criar                                                                                                  |
    | Formato           | "2 times de 6 · 12 vagas", ou "Sem limite de vagas"                                    | times e pessoas por time, ou sem formato                                                                                            |
    | Abertura da lista | "Membros 72 h antes · Reservas 24 h antes · Convidados 6 h antes", ou "Aberta a todos" | para membros, reservas e convidados: "desde já" ou as horas antes; "sem convidados"; e o fechamento                                 |
    | Resultado         | "Pelo dia" ou "Por jogo"                                                               | **Pelo dia** ("o time que venceu") ou **Por jogo** ("cada jogo do rodízio"), PAR-31                                                 |
    | Vale para         | "Temporada 2027.1", ou "Nenhuma competição"                                            | uma linha de ligar para cada competição aberta cujo período tem o dia da partida (PAR-40); sem nenhuma, "Nenhuma competição aberta" |
    | Repetição         | "Toda sexta · 19:00 · 2 h", ou "Encerrada" (só na partida de uma repetição)            | o que a repetição tem (PAR-20) e **Encerrar repetição**, com confirmação (PAR-23)                                                   |

  - **Na partida de uma repetição ativa,** os painéis de Dia e hora, Formato, Abertura da lista, Resultado e Vale para têm o botão de ligar **Também nas próximas semanas**: ligado, salvar muda a partida (PAR-06, 40) e a repetição (PAR-22). Ele começa ligado no Formato, na Abertura, no Resultado e no Vale para, e desligado no Dia e hora, que costuma mudar só uma semana. _(Nova em 2026-11-23. Alterada em 2026-11-25: entrou o Resultado.)_
  - A confirmação de encerrar diz o que fica: "As próximas semanas não serão criadas. A partida de sex, 27/11 continua; para tirar, cancele." (PAR-23)
  - _(Alterada em 2026-11-23: antes, um Editar com todos os campos num painel só. Alterada de novo em 2026-11-23: "Ondas" virou "Abertura da lista", e saiu o Recado. Alterada de novo em 2026-11-23: entrou a Repetição.)_
  - _Por quê (Também nas próximas semanas):_ no começo, quem organiza configura a partida e quer as próximas iguais; depois, a mudança de uma semana só (o feriado que mudou a hora) não pode levar as outras junto. O botão mostra a escolha em vez de adivinhar.
  - Sem login, a pessoa passa pelo login e volta para a página. Quem não participa vê que a partida não foi encontrada.
- **PAR-19. Copiar para o WhatsApp:** na página da partida, qualquer participante copia (ou compartilha, quando o navegador tem) a mensagem da lista, montada na tela:

  ```
  Pelada de sexta · sex, 27/11 às 19:00

  Confirmados (10 de 12)
  1. Edu
  2. Carioca
  ...
  Fila
  1. Bia
  Não vão
  1. Janice

  Confirme aqui: <link da partida>
  ```

  - O dia e a hora saem no fuso de quem copia (ADR 0006). O convidado sai como "Nome (convidado de Fulano)". Sem formato, "Confirmados (10)".
  - _Por quê:_ o grupo continua conversando no WhatsApp, e a mensagem leva todo mundo para o link, onde a resposta vale. Sem chat no app.
  - **Com times salvos, há também Copiar times** (ou compartilhar), com a mensagem dos times. Quem saiu da lista não entra nela, e o convidado sai só com o nome. _(Nova em 2026-11-24.)_

    ```
    Pelada de sexta · sex, 27/11 às 19:00

    Time 1
    1. Edu
    2. Bia
    ...
    Time 2
    1. Carioca
    ...

    Partida: <link da partida>
    ```

    - _Por quê:_ na quadra, o time de cada um é conferido no WhatsApp. Duas mensagens, e não uma, porque a lista e os times são mandados em horas diferentes.

- **PAR-30. A tela de dividir** (`/groups/{publicId}/matches/{matchId}/teams`, aberta por **Dividir times** ou **Mudar times**, PAR-18), só para quem tem `matches.manage`; para os outros, a rota leva à página da partida. _(Nova em 2026-11-24.)_
  - **Sem times salvos,** ela abre já com um sorteio (PAR-26), no número de times sugerido. **Com times salvos,** abre com eles, sem quem saiu da lista, e com quem está sem time numa seção **Sem time** (PAR-28).
  - No topo, **Times: − 2 +** (de 2 a 10) e **Sortear** (com times na tela, **Sortear de novo**). Mudar o número não sorteia: quem estava num time que sumiu vai para Sem time, e um time novo nasce vazio.
  - Cada time mostra o número de pessoas e as pessoas, com a marca "reserva" e "convidado". Tocar numa pessoa abre um painel de baixo com **Time 1**, **Time 2**... e **Sem time**, o atual marcado: escolher move a pessoa. Sem arrastar: tocar funciona igual no celular.
  - **Salvar** grava (PAR-25) e volta para a página da partida. Sair com mudanças não salvas pede confirmação ("Descartar os times?").
  - Ao salvar com `MATCH_TEAM_PLAYER_OUT`, a tela relê a partida, tira quem saiu, mantém o resto como estava e avisa ("Fulano saiu da lista. Confira e salve de novo."), com os nomes que a api mandou (PAR-25); quem vem sem nome entra como "Alguém". _(Alterada em 2026-11-24: antes, os nomes vinham só da lista que a tela tinha.)_ Com `VERSION_CONFLICT`, ela relê os times salvos e avisa ("Alguém mudou os times antes de você. Atualizamos; faça a mudança de novo.").
  - _Por quê:_ dividir tem muitos controles e precisa do espaço da tela inteira; a página da partida continua sendo a do "eu vou?". Abrir já sorteado faz o caso comum (sortear e salvar) ser um toque.

- **PAR-37. Anteriores** (na área Partidas, PAR-17) lista o histórico (PAR-36) em cartões, como as próximas: o dia e a hora, e embaixo "Cancelada", "Sem resultado", "Time 2 venceu", "Empate" ou, por jogo, "Edu venceu o dia" ("Edu e Bia venceram o dia"; com mais de 2, "Edu, Bia e mais 3 venceram o dia"). Tocar abre a página da partida. No fim da lista, **Carregar mais**, enquanto houver. Sem nenhuma, "Nenhuma partida terminou ainda." _(Nova em 2026-11-25.)_
- **PAR-38. A seção Resultado** na página da partida (PAR-18), depois de iniciar (PAR-41): _(Nova em 2026-11-25.)_
  - embaixo do título, para que competições ela vale ("Vale para Temporada 2027.1", tocar abre a competição); para quem tem `matches.manage`, **Mudar**, que abre o painel do Vale para (PAR-18, 40), também depois de finalizar. Sem nenhuma, a linha só aparece para quem pode mudar ("Não vale para nenhuma competição"). _(Nova em 2026-11-25.)_
  - **sem resultado,** "Sem resultado ainda";
  - **pelo dia,** quem venceu ("Time 2 venceu", ou "Empate") e os times do resultado, o vencedor marcado, e **Você venceu** para quem estava nele;
  - **por jogo,** no topo quem venceu o dia; depois a contagem de quem jogou, "4 V · 1 D em 5 jogos", de quem mais venceu para quem menos venceu (no empate, pelo apelido); e os jogos, numerados, cada um "Time A × Time B" com as pessoas e a marca no vencedor (ou "Empate"). Os jogos começam fechados (só o número e quem venceu), e tocar abre.
  - _Por quê:_ na volta para casa, o que todo mundo quer ver é quem venceu e "como eu fui". Os jogos abertos encheriam a página.
- **PAR-39. A tela do resultado** (`/groups/{publicId}/matches/{matchId}/result`, aberta por **Registrar resultado** ou **Corrigir resultado**, PAR-18), só para quem tem `matches.manage` e depois de iniciar (PAR-41); para os outros, a rota leva à página da partida. _(Nova em 2026-11-25.)_
  - No topo, **Pelo dia | Por jogo**: começa no jeito do resultado registrado, ou no configurado (PAR-31). Trocar com algo já preenchido pede confirmação ("O que está no outro jeito vai ser descartado.").
  - **Pelo dia:** os times, que começam nos do resultado registrado ou, sem ele, nos times salvos (PAR-25; sem times salvos, dois times vazios). Eles se ajustam como na tela de dividir (PAR-30), com tocar na pessoa, e quem está na lista e não está num time fica em **De fora**. Embaixo, **Quem venceu?**, com **Time 1**, **Time 2**... e **Empate**.
  - **Por jogo:** os jogos numerados, e **Novo jogo**, que abre um painel com as pessoas da lista (dentro e depois fila): cada uma em **Time A**, **Time B** ou **De fora**, com tocar, e **Quem venceu?**, com **Time A**, **Time B** e **Empate**, por último. **O jogo novo vem com os times do anterior**; o primeiro, com o Time 1 e o Time 2 salvos (os outros times salvos ficam De fora), ou vazio sem times salvos. Tocar num jogo abre o mesmo painel para corrigir, com **Apagar jogo**, com confirmação (os seguintes são renumerados).
  - **Salvar** grava o resultado inteiro (PAR-32) e volta para a página da partida. Sair com mudanças não salvas pede confirmação ("Descartar o resultado?").
  - `MATCH_TEAM_PLAYER_OUT` e `VERSION_CONFLICT` são tratados como na tela de dividir (PAR-30), com "Alguém mudou o resultado antes de você".
  - _Por quê:_ o resultado é anotado na beira da quadra, no celular, entre um jogo e outro. Repetir os times do jogo anterior faz cada registro levar segundos: no rodízio, quase sempre só um time muda. Salvar o resultado inteiro, como os times, mantém um "salvar" só. Quem quiser salva a cada jogo, e o próximo **Registrar** continua de onde parou.

## 3. Como funciona

### Dados (na partição do grupo, ADR 0014)

| Item              | Chave                                                       | Para quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partida           | `GROUP#<g>` / `MATCH#<matchId>`                             | entidade (`newEntity`): `startsAt`, `endsAt` (UTC, ADR 0006; a duração é a diferença), `teams` e `playersPerTeam` (os dois ou nenhum: sem formato), as ondas em horas, cada uma ausente quando não configurada (`membersHours`, `reservesHours`, `guestsHours`), `noGuests` ("sem convidados"), `closeHours` (0 sem configurar), `advancedTo` (PAR-05), `openedAt` (`{ members?, reserves?, guests? }`: a hora em que cada onda abriu antes da hora configurada, PAR-16; gravada junto com o `advancedTo`, só para as ondas até ele, e nunca regravada), `notifiedWave` (a maior onda já avisada, PAR-24; gravar ele não soma a `version`, e a edição não o regrava, a não ser na primeira configuração da abertura), `seriesId` e `seriesDate` (a repetição e o dia previsto, no fuso dela, PAR-21; só na partida de uma repetição), `resultMode` (`day` ou `games`, PAR-31), `competitionIds` (PAR-40; ausente quando vazio, e a repetição guarda o seu), `startedAt`/`startedBy` (PAR-41; apagados ao voltar para a lista, PAR-42), `finishedAt`/`finishedBy` (PAR-43), `cancelledAt`, `createdBy`, `version`. As próximas (PAR-15) e a conta das 20 por vir (PAR-01) vêm do índice das próximas, não da partição inteira |
| Próximas          | `GROUP#<g>` / `MATCHOPEN#<matchId>`                         | `{ matchId }`, ponteiro (`LOOKUP_ENTITY`): uma partida que ainda está nas próximas (PAR-15). Gravado com a partida (criar e a próxima da repetição, PAR-21), na mesma transação; apagado ao finalizar (PAR-43), na mesma transação. Ao cancelar (PAR-07) fica, com `ttl` de 7 dias depois do fim marcado, como reserva (ADR 0004): a cancelada sai das próximas pelo fim marcado, conferido ao ler. As próximas são uma Query `begins_with(SK, "MATCHOPEN#")` → BatchGet das partidas, ordenadas pelo início ao ler; as 20 por vir são as dessa lista sem `cancelledAt`. _(Novo em 2026-11-26: antes, as próximas liam todas as partidas do grupo, desde sempre.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Fim da partida    | `GROUP#<g>` / `MATCHEND#<endsAt>#<matchId>`                 | `{ matchId }`, gravado com a partida e regravado (o antigo apagado) quando a edição muda o fim, na mesma transação (PAR-06). O histórico (PAR-36) é uma Query `begins_with(SK, "MATCHEND#")` de trás para a frente, desde o fim marcado mais distante (as próximas também estão no índice), que fica só com as finalizadas e as canceladas que passaram do fim, em páginas de 20 (o `cursor` é a última chave lida); cada página lê as partidas e os resultados dela num BatchGet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Resultado         | `GROUP#<g>` / `MATCHRESULT#<matchId>`                       | `mode`; pelo dia, `teams` (como os times, PAR-25) e `winner` (o número do time, 1 a 10, ou `draw`); por jogo, `games` (`{ teams: [a, b], winner: 'a' \| 'b' \| 'draw' }[]`). As pessoas, como nos times (`{ kind, id }`). `createdAt`/`createdBy`, `updatedAt`/`updatedBy`, `version`. Chave natural pela partida (ADR 0009), sem lookup; o primeiro registro grava com `attribute_not_exists`. A contagem e quem venceu o dia são calculados ao ler (PAR-33, 34)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Resposta          | `GROUP#<g>` / `MATCHATT#<matchId>#<userId>`                 | entidade de relação (ADR 0009): `status` (`going` ou `not_going`), `respondedAt` (a hora da resposta atual, que dá a ordem), `updatedAt`, `version`. A resposta com `respondedAt` antes da data de entrada atual da pessoa (o `createdAt` da participação) é ignorada ao ler (PAR-10). As respostas da partida são uma Query `begins_with(SK, "MATCHATT#<matchId>#")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Convidado         | `GROUP#<g>` / `MATCHGUEST#<matchId>#<guestId>`              | entidade: `name`, `requestedBy`, e a data e quem de cada passo (`approvedAt`/`approvedBy`, `declinedAt`/`declinedBy`, `removedAt`/`removedBy`; o pedido desistido é apagado, PAR-14). A situação (PAR-11) é calculada desses campos; a ordem na lista é o `approvedAt`. Os convidados da partida são uma Query `begins_with(SK, "MATCHGUEST#<matchId>#")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Convidados ativos | `GROUP#<g>` / `MATCHGUESTS#<matchId>`                       | contador (`active`, os `pending` + `approved`), que muda com `ADD` na mesma transação do convidado, com a condição `active < 30` ao pedir (PAR-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Nome do convidado | `GROUP#<g>` / `MATCHGUESTNAME#<matchId>#<nome normalizado>` | `{ guestId }`, gravado com `attribute_not_exists` ao pedir e apagado ao recusar, cancelar ou remover, na mesma transação (PAR-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Repetição         | `GROUP#<g>` / `MATCHSERIES#<seriesId>`                      | entidade: `weekday` (1 a 7, segunda a domingo), `time` (`HH:mm`), `durationMinutes`, `timeZone` (IANA), o formato, a abertura e o `resultMode` como na partida, `currentMatchId` e `currentDate` (a próxima partida e o dia previsto dela), `endedAt`, `createdBy`, `version`. As do grupo são uma Query `begins_with(SK, "MATCHSERIES#")` (o limite de PAR-20 conta as sem `endedAt`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Times             | `GROUP#<g>` / `MATCHTEAMS#<matchId>`                        | `teams`: a lista dos times, na ordem, e cada time a lista das pessoas (`{ kind: 'user' \| 'guest', id }`, com o uuid do usuário ou o id do convidado; a api traduz o id público na entrada). `createdAt` e `createdBy` (o primeiro salvar, PAR-29), `updatedAt`, `updatedBy`, `version`. Chave natural pela partida (ADR 0009): um item por partida, sem lookup. O primeiro salvar grava com `attribute_not_exists` (a `version` esperada é 0), e quem ganha essa condição avisa. Não guarda "sem time" nem "saiu da lista": os dois são calculados ao ler, comparando com a lista de dentro (PAR-28)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Agenda            | `MATCHAGENDA#<AAAA-MM-DDTHH>` / `<instante>#<g>#<matchId>`  | `{ groupId, matchId, publicId, groupName }`: "olhe esta partida neste instante", com o id público e o nome do grupo para a rotina montar o aviso sem ler o grupo (hoje o grupo não muda de nome, [grupos.md](grupos.md) §4; quando mudar, a troca do nome regrava o `groupName` dos itens das partidas que ainda vão acontecer, ou a rotina passa a ler o grupo). Gravado ao criar e ao editar a partida, na mesma transação dela (a partida não fica salva sem os itens da agenda), um para cada onda configurada (PAR-24). A repetição não usa mais a agenda: a próxima nasce ao finalizar ou cancelar (PAR-21). A partição é a hora (UTC). Regravar o mesmo item (a edição regrava os da partida) mantém o `createdAt` de quando ele foi gravado a primeira vez. Apagado depois de tratado; `ttl` de 7 dias depois do instante, como reserva (ADR 0004). Não é dado da partida: a regra "nada das partidas expira" (PAR-07) não vale para ele                                                                                                                                                                                                                                                                             |
| Rotina            | `ROUTINE#MATCHAGENDA` / `META`                              | `lastRunAt`: até onde a rotina já leu a agenda                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

- **A lista é calculada ao ler** (PAR-09): as respostas `going` de quem ainda participa, dadas depois da entrada atual (PAR-10), e os convidados `approved`, juntos, por `respondedAt` ou `approvedAt` (a hora do servidor, ISO em UTC com milissegundos) e, no empate, pelo id (o `userId` ou o `guestId`). As posições de 1 até as vagas estão dentro; as outras, na fila. Sem formato, todas estão dentro.
- **O aviso de promoção** (PAR-09) sai de comparar a lista de dentro antes e depois da gravação: a leitura de antes, a gravação, e uma leitura consistente depois.
- A onda atual sai de `startsAt`, das horas de cada onda (a ausente abre com a anterior, e a dos membros desde a criação), do `noGuests` e do `advancedTo`. Abrir à mão (PAR-05) e editar (PAR-06) gravam em `advancedTo` a onda aberta naquela hora, quando ela é maior: é isso que impede a onda de voltar. Na mesma gravação, cada onda até o `advancedTo` cuja hora configurada fica depois da hora em que abriu de fato ganha essa hora no `openedAt`: à mão, a hora do pedido; na edição, a hora que ela já mostrava antes (a configurada antiga, ou o `openedAt` que já existia). As horas das ondas acima do `advancedTo` saem. A situação (PAR-16) é calculada do `cancelledAt`, do `finishedAt`, do `startedAt` e, sem eles, da hora; não há campo de status.
- **A rotina** (`matchesAgenda`, evento `schedule` a cada 15 min, no `functions.ts` do módulo, ADR 0012) lê as partições da agenda da hora do `lastRunAt` até a hora atual (no máximo as últimas 48 h), trata cada item com instante até agora e o apaga. Cada item é tratado sozinho: o que falha é registrado no log e fica na agenda, e os outros seguem. O `lastRunAt` para na hora do primeiro item que falhou, então a próxima execução tenta de novo só os que sobraram, até eles saírem das 48 h. Tratar é reler a partida e decidir pela verdade dela, então um item velho (a partida mudou de hora depois) não faz nada errado, e tratar duas vezes não duplica:
  - **aviso:** se a onda atual é maior que o `notifiedWave` e a partida não foi cancelada nem iniciada, grava a onda atual em `notifiedWave` com a condição de ele não ter mudado, e só então avisa (PAR-24). Quem ganhou a condição avisa; o outro, não.
- **Iniciar, voltar e finalizar** (PAR-41–43) gravam na partida, com a condição de ela ainda estar como foi lida (iniciar: sem `startedAt`, `finishedAt` nem `cancelledAt`; voltar: com `startedAt`, sem `finishedAt` e sem resultado; finalizar: com `startedAt` e sem `finishedAt`). Somam a `version` da partida (ADR 0013), mas não pedem a `version` de quem toca: são ações de uma vez, como cancelar, e repetir não muda nada.
- **A próxima da repetição** (PAR-21) nasce na mesma transação de finalizar ou cancelar: a partida que terminou, a partida nova, os itens de agenda dela, e a repetição com o `currentMatchId` e o `currentDate` novos, com a condição de o `currentMatchId` ainda ser o da que terminou e de a repetição não estar encerrada. Na partida nova, o `notifiedWave` fica vazio: as ondas abertas ao nascer avisam logo depois, dentro da mesma requisição.
- A partida criada por uma pessoa (PAR-01) grava o `notifiedWave` com a onda aberta na criação. Abrir à mão (PAR-05) e editar (PAR-06) fazem a mesma conferência do aviso dentro da requisição, depois da gravação. A primeira configuração da abertura grava o `notifiedWave` com a onda que vale depois dela.
- **Os times** (PAR-25–28) são lidos junto com a partida, num GetItem a mais. O sorteio (PAR-26) roda só na web (`web/src/modules/groups/matches/match.teams.ts`, puro e testado): a api só confere e grava o que se salva. Conferir quem está dentro ao salvar usa a mesma lista calculada da leitura (PAR-09).
- **O resultado** (PAR-31–35) é lido junto com a partida, como os times: a partida vem antes (as conferências dependem dela), e os times e o resultado vêm depois, num GetItem cada, em paralelo. No histórico (PAR-36), as partidas e os resultados de cada página vêm num BatchGet. Conferir quem está na lista ao registrar usa a mesma lista calculada da leitura (PAR-09), com dentro e fila. A contagem e quem venceu o dia saem de funções puras no contrato, que a api e a web usam: a web mostra a contagem enquanto se anota, antes de salvar.
- O fuso da repetição converte o dia e a hora em UTC (`api/src/lib/zoned.ts`, ADR 0006).
- **Partidas e grupo:** o módulo de partidas pergunta ao grupo só quem participa, como (membro ou reserva) e se a pessoa tem uma permissão (GRV-15). O grupo não sabe nada das partidas: as ondas, a lista, a fila e os convidados ficam todos aqui.
- Responder não usa `version`: é uma disputa por lugar, e a ordem de chegada decide (ADR 0016).

### Rotas

| Rota                                                            | Quem                           | Regras         |
| --------------------------------------------------------------- | ------------------------------ | -------------- |
| `POST /groups/{publicId}/matches`                               | `matches.manage`               | PAR-01–04, 20  |
| `GET /groups/{publicId}/matches`                                | quem participa                 | PAR-15         |
| `GET /groups/{publicId}/matches/{matchId}`                      | quem participa                 | PAR-16, 10     |
| `PUT /groups/{publicId}/matches/{matchId}`                      | `matches.manage`               | PAR-06         |
| `POST /groups/{publicId}/matches/{matchId}/advance`             | `matches.manage`               | PAR-05         |
| `POST /groups/{publicId}/matches/{matchId}/cancel`              | `matches.manage`               | PAR-07, 21     |
| `POST /groups/{publicId}/matches/{matchId}/start`               | `matches.manage`               | PAR-41         |
| `POST /groups/{publicId}/matches/{matchId}/unstart`             | `matches.manage`               | PAR-42         |
| `POST /groups/{publicId}/matches/{matchId}/finish`              | `matches.manage`               | PAR-43, 21     |
| `PUT /groups/{publicId}/matches/{matchId}/attendance`           | quem participa                 | PAR-08, 09     |
| `POST /groups/{publicId}/matches/{matchId}/guests`              | quem participa                 | PAR-11, 12     |
| `POST /groups/{publicId}/matches/{matchId}/guests/{id}/approve` | `matches.manage`               | PAR-11, 13     |
| `POST /groups/{publicId}/matches/{matchId}/guests/{id}/decline` | `matches.manage`               | PAR-11, 13     |
| `DELETE /groups/{publicId}/matches/{matchId}/guests/{id}`       | quem pediu ou `matches.manage` | PAR-11, 14     |
| `PUT /groups/{publicId}/matches/{matchId}/teams`                | `matches.manage`               | PAR-25, 28, 29 |
| `PUT /groups/{publicId}/matches/{matchId}/result`               | `matches.manage`               | PAR-31–35      |
| `GET /groups/{publicId}/matches/history`                        | quem participa                 | PAR-36         |
| `PUT /groups/{publicId}/matches/{matchId}/competitions`         | `matches.manage`               | PAR-40         |
| `PUT /groups/{publicId}/match-series/{seriesId}`                | `matches.manage`               | PAR-22         |
| `POST /groups/{publicId}/match-series/{seriesId}/end`           | `matches.manage`               | PAR-23         |
| rotina `matchesAgenda` (a cada 15 min)                          | —                              | PAR-24         |

Erros: `VALIDATION_ERROR`, `GROUP_NOT_FOUND`, `GROUP_PERMISSION_DENIED`, `MATCH_NOT_FOUND` (404), `MATCH_LIMIT` (409, `details.limit`), `MATCH_SERIES_NOT_FOUND` (404), `MATCH_SERIES_LIMIT` (409, `details.limit`), `MATCH_SERIES_ENDED` (409), `MATCH_NOT_OPEN_FOR_YOU` (409, `details.opensAt`, ausente com "sem convidados"), `MATCH_CLOSED` (409), `MATCH_STARTED` (409), `MATCH_NOT_STARTED` (409), `MATCH_FINISHED` (409), `MATCH_HAS_RESULT` (409), `MATCH_CANCELLED` (409), `MATCH_TEAM_PLAYER_OUT` (409, `details.players`), `MATCH_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed`), `MATCH_GUEST_NOT_FOUND` (404), `MATCH_GUEST_NOT_PENDING` (409, `details.status`), `MATCH_GUEST_DUPLICATE` (409), `MATCH_GUEST_LIMIT` (409, `details.limit`), `MATCH_OUTSIDE_COMPETITION` (422, `details.competitionId`), `COMPETITION_NOT_FOUND` e `COMPETITION_LOCKED` (do módulo [Competição](competicao.md), no Vale para), `VERSION_CONFLICT`. Avisos: `match_promoted`, `match_cancelled`, `match_guest_requested`, `match_list_open`, `match_teams_ready`.

## 4. Limites conhecidos

- A repetição é só semanal, e só existe a próxima partida de cada uma: não dá para responder "não vou" para daqui a duas semanas (PAR-21).
- Mudar a repetição não muda a próxima partida, que já existe (PAR-22): a tela oferece mudar as duas.
- Encerrar a repetição não se desfaz, e não há pausa (PAR-23).
- O aviso de lista aberta pela hora chega até 15 min depois de a onda abrir. No dev local, a rotina roda sozinha com o `npm run dev` de pé, e na hora com `npm run invoke:scorely -- matchesAgenda` (ADR 0012).
- Um item da agenda que falha por mais de 48 h é deixado de lado: o aviso daquela onda não sai. O log é o que mostra o que falhou.
- **A partida que ninguém finaliza não termina** (PAR-43): ela fica nas próximas, conta nas 20 por vir e, numa repetição, segura a semana seguinte, que só nasce ao finalizar ou cancelar. Não há lembrete de finalizar nem fim automático.
- A hora marcada continua sendo a da partida: a ordem das listas (PAR-15, 36), a lista que abre e fecha (PAR-03, 04) e o dia para a competição (PAR-40) saem dela, e não da hora em que foi iniciada ou finalizada.
- Finalizar não se desfaz (PAR-43), e voltar para a lista só vale sem resultado (PAR-42).
- Se o envio do aviso de lista aberta falha depois de a onda ser marcada em `notifiedWave`, aquele aviso não sai de novo: marcar antes de avisar é o que impede o aviso duplicado (PAR-24).
- Não há lembrete além do aviso de lista aberta (ex.: "falta 1", "a lista fecha em 1 h").
- A partida criada à mão não avisa ao nascer, nem as ondas já abertas (PAR-24).
- A fila que sobe porque alguém saiu do grupo (PAR-10) não avisa quem subiu.
- O aviso de promoção (PAR-09) é a melhor tentativa: com duas saídas no mesmo instante, quem subiu pode não ser avisado, ou ser avisado duas vezes. A lista, essa, está sempre certa: o aviso não decide quem está dentro.
- Não há reabrir uma partida cancelada nem apagar uma partida: cancelar é o fim.
- Quem organiza não tira um participante da lista (só convidados, PAR-14). Quem faltou sem avisar continua na lista.
- O convidado não tem histórico: é só um nome naquela partida.
- Partidas do mesmo grupo podem se sobrepor no horário.
- Não há chamada: faltar não se registra, e quem estava na lista e não está no resultado só "não jogou" (PAR-32).
- O resultado não avisa ninguém, não se apaga (só se corrige) e não tem placar: só quem venceu (PAR-32).
- Só quem estava na lista (dentro ou fila) entra no resultado. Quem jogou sem ter confirmado não aparece: quem organiza não põe ninguém na lista (PAR-33).
- Por jogo, um jogo tem sempre dois times (PAR-34).
- O histórico mostra as listas de agora: quem saiu do grupo depois sai delas, e só continua no resultado (PAR-36).
- O sorteio é só ao acaso: não equilibra por nada, nem por gênero (PAR-26). O equilíbrio fica com o ajuste à mão.
- Não há fixar alguém num time antes de sortear: sortear de novo espalha todo mundo (PAR-26).
- Quem está na fila não entra num time (PAR-25). Se alguém da fila joga no lugar de quem não veio, quem organiza muda a lista antes (o atrasado diz "não vou", e a fila sobe).
- Os times se chamam só "Time 1", "Time 2"..., sem nome nem cor.
- Mudar os times depois do primeiro salvar não avisa ninguém (PAR-29).

## 5. Em discussão (ainda não é regra)

- **Próxima etapa:** o ranking e a temporada viraram o módulo [Competição](competicao.md) em 2026-11-25, e a partida ganhou o Vale para (PAR-40). A chamada (quem veio e quem faltou) e o aviso do resultado ficam para depois, junto com a votação do dia (competicao.md, seção 5). O sorteio ajustável entrou em 2026-11-24 (PAR-25–30); o resultado e o histórico, em 2026-11-25 (PAR-31–39). _(Alterada em 2026-11-24. Alterada em 2026-11-25. Alterada de novo em 2026-11-25.)_
- **Nível manual, para o sorteio** (conversa de 2026-11-25, muda o "sem nível técnico" da etapa 3): de 1 a 5, dado por quem tem `matches.manage` e visto só por quem tem a permissão, para membros e reservas; o convidado ganha o nível na partida (sem nível, 3). O sorteio usa o nível para equilibrar os times. Fica neste módulo, que é quem sorteia, e não no grupo. O cálculo automático pelos resultados vem depois.
- **Resultado, depois:** o placar de cada jogo e quem fez cada ponto (saque, bloqueio, ataque, erro), sem mudar o resultado de hoje (o placar entra no jogo, ao lado do `winner`); copiar o resultado para o WhatsApp; e o histórico de cada pessoa ("joguei 12, venci 7").
- **Times, depois:** equilibrar o sorteio pelo nível (acima) e, mais tarde, pelo histórico; espalhar homens e mulheres (o perfil já tem o gênero, USR); fixar alguém num time antes de sortear; nome ou cor do time (o colete); e quem está na fila num time. Equilibrar pelo histórico leva o sorteio para a api, que tem os resultados.
- **Quem está numa lista e perde o perfil** (dentro, fila ou não vão, PAR-16): hoje nada apaga um perfil. A "Pessoa removida" vale só nos times (PAR-28). O que as listas fazem (some, aparece como removida, se ocupa vaga, se a fila sobe) fica para decidir junto com apagar a conta. _(Nova em 2026-11-24.)_
- **Local da partida:** saiu em 2026-11-23. Não vai ser texto livre; o jeito (lugares cadastrados no grupo, endereço, mapa) fica para decidir.
- **Recado da partida** (o "FERIADO!"): saiu em 2026-11-23, como o local. Volta se fizer falta, decidido de novo.
- **Modelo Organizador** (GRV-51), com `matches.manage`, quando houver mais de uma permissão de partida.
