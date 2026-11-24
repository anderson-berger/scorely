# Módulo Partidas

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-24.

Código: `apps/scorely/api/src/modules/matches/`, `apps/scorely/web/src/modules/matches/`. Contrato: `apps/scorely/contracts/src/matches.ts`.

## 1. Para que serve

**O grupo reúne as pessoas. A partida reúne as pessoas para jogar. O histórico registra o que aconteceu.** Por isso a partida não apaga nada do que aconteceu nela (PAR-07, 11): o histórico (seção 5) vai ser feito a partir disso.

Tirar a lista do jogo do WhatsApp. Quem organiza cria a partida, manda a mensagem pronta no grupo do WhatsApp, e cada pessoa confirma pelo link. A partida nasce limpa: lista aberta a todos e sem limite de vagas. Quem quiser configura o formato (as vagas) e a abertura da lista, que faz a lista encher em ondas, sozinha, pelo horário: primeiro os membros, depois as reservas e, se ainda sobrar vaga, convidados de fora, só com o nome. A partida pode se repetir toda semana: quando uma termina, a da semana seguinte nasce sozinha, e cada onda que abre avisa quem pode confirmar. Quem organiza divide os times de quem está dentro: sorteia, ajusta à mão e salva, e todos veem o seu time. O resultado entra na próxima etapa (seção 5). _(Alterada em 2026-11-23: entrou a repetição. Alterada em 2026-11-24: entraram os times.)_

Caso de referência: a Ana cria a partida de sexta, às 19h, toda semana, e configura 2 times de 6 e a abertura da lista. A lista abre para os membros na terça, e eles recebem o aviso. Na quinta ainda faltam 3, e ela abre para as reservas, que recebem o aviso. Na sexta de manhã falta 1, e o Edu pede para trazer o primo, só com o nome. A Ana libera. Cada vez que a lista muda, ela copia a mensagem e cola no WhatsApp. Na sexta à tarde, com a lista fechada, ela sorteia 2 times, troca o Edu e o Carioca de time e salva: cada um vê o seu time na página da partida, e ela copia os times para o WhatsApp. Quando a partida termina, a da sexta seguinte já existe, com o mesmo formato e a mesma abertura.

| Termo      | Significado                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partida    | um jogo do grupo, com dia, hora, duração, formato e lista                                                                                                                                                                  |
| Formato    | quantos times e quantas pessoas por time. As **vagas** são a conta dos dois (2 × 6 = 12). Sem formato, sem limite (PAR-02)                                                                                                 |
| Onda       | quem pode confirmar agora: `members` (membros), `reserves` (membros e reservas) ou `guests` (também convidados). Na tela, a configuração das ondas se chama **Abertura da lista**, e a palavra "onda" não aparece (PAR-03) |
| Lista      | quem disse "vou", na ordem de chegada. Os primeiros, até as vagas, estão **dentro**                                                                                                                                        |
| Fila       | quem disse "vou" com as vagas cheias. Sobe sozinho quando alguém de dentro sai (PAR-09)                                                                                                                                    |
| Não vão    | quem disse "não vou" (os "Ausentes" da lista do WhatsApp)                                                                                                                                                                  |
| Convidado  | alguém de fora do grupo, só com o nome e sem conta, que um participante pediu e quem organiza liberou (PAR-13)                                                                                                             |
| Fechamento | a hora a partir da qual ninguém mais entra na lista (PAR-04)                                                                                                                                                               |
| Repetição  | o molde de uma partida toda semana: o dia da semana, a hora, a duração, o fuso, o formato e a abertura. Ela cria as partidas, uma de cada vez (PAR-20, 21)                                                                 |
| Times      | a divisão de quem está dentro em "Time 1", "Time 2"... A partida tem uma só, que quem organiza salva (PAR-25)                                                                                                              |
| Sorteio    | a sugestão de times que a tela faz ao acaso, para quem organiza ajustar antes de salvar. Não é gravado (PAR-26)                                                                                                            |
| Sem time   | quem está dentro e não está em nenhum time salvo, como quem confirmou depois (PAR-28)                                                                                                                                      |

"Lista de espera", no grupo, são as **reservas** (GRV-17 em [grupos.md](grupos.md)): gente que joga quando sobra vaga. A fila daqui é outra coisa: é quem confirmou com a lista cheia.

## 2. Regras de negócio

### Criar e editar

- **PAR-01. Quem tem `matches.manage` (GRV-15) cria a partida só com o dia, a hora e a duração** (`POST /groups/{publicId}/matches` `{ startsAt, endsAt }`). O resto **nasce vazio** e se configura depois, nas configurações da partida (PAR-06):

  | Campo               | Valores                                                    | Ao criar                                          |
  | ------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
  | Dia, hora e duração | o início no futuro, até 90 dias; a duração de até 24 h     | escolhidos por quem cria                          |
  | Formato             | de 1 a 10 times, de 1 a 50 pessoas por time, até 100 vagas | sem formato: sem limite de vagas (PAR-02)         |
  | Abertura da lista   | PAR-03, 04                                                 | sem configuração: aberta a todos, fecha no início |
  - A tela mostra dia, hora e duração; a api recebe e guarda o início e o fim (UTC, ADR 0006), e o fim é o início mais a duração.
  - Fora disso, `VALIDATION_ERROR` (422). Quem participa e não tem a permissão recebe `GROUP_PERMISSION_DENIED`; quem não participa, `GROUP_NOT_FOUND` (GRV-04).
  - O grupo tem no máximo **20 partidas por vir** (que ainda não terminaram). A 21ª responde `MATCH_LIMIT` (409, `details.limit`).
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

- **PAR-04. A lista fecha em horas antes do início** (de 0, sem configurar, até a onda configurada mais tarde). Depois do fechamento, ninguém entra (`MATCH_CLOSED`, 409), mas quem está na lista ainda pode desistir até o início (PAR-08).
  - _Por quê:_ quem organiza precisa de um momento em que a lista para de mudar para montar os times. Desistir continua valendo: é melhor saber antes de chegar à quadra.
- **PAR-05. Quem tem `matches.manage` abre a próxima onda antes da hora** (`POST /groups/{publicId}/matches/{matchId}/advance` `{ wave }`, com `wave` = `reserves` ou `guests`). A onda pedida e as anteriores ficam abertas na hora. Abrir uma onda que já está aberta não muda nada. Os convidados abrem assim mesmo com a onda deles desligada. Depois do fechamento, `MATCH_CLOSED`.
  - Sem a abertura configurada, tudo já está aberto, e não há o que abrir.
  - **Abrir antes não se desfaz:** uma onda aberta, pela hora ou à mão, não fecha mais (PAR-06).
  - Abrir à mão avisa na hora quem a onda deixou confirmar (PAR-24). _(Nova em 2026-11-23.)_
  - _Por quê:_ às vezes a quarta-feira já mostra que os membros não vão fechar. Esperar a hora só atrasa quem quer jogar.
- **PAR-06. Quem tem `matches.manage` muda as configurações da partida** (`PUT /groups/{publicId}/matches/{matchId}` com todas as configurações: o início e o fim, o formato (ou nenhum) e a abertura da lista (as horas configuradas, "sem convidados" e o fechamento), e o `expectedVersion`, [ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)), até o início (depois, `MATCH_STARTED`, 409). _(Alterada em 2026-11-23: antes, "edita a partida", com o local e o recado.)_
  - Diminuir as vagas abaixo de quem já está dentro responde `MATCH_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed`).
  - Aumentar as vagas faz a fila subir, com o aviso de PAR-09.
  - Mudar a hora não tira ninguém da lista. As ondas acompanham o início (PAR-03), mas **a onda atual nunca volta**: se a edição faria uma onda já aberta fechar (o início foi para depois, ou as horas diminuíram), ela continua aberta (PAR-05).
  - **A primeira configuração da abertura passa a valer:** a lista que estava aberta a todos só por não ter abertura configurada (PAR-03) segue as horas novas. Se ainda não é a hora das reservas, a reserva volta a esperar. Quem já confirmou continua na lista (PAR-09). O "nunca volta" vale para a onda aberta por uma hora configurada ou à mão (PAR-05). _(Nova em 2026-11-23.)_
  - Uma edição que abre uma onda (as horas aumentaram, ou o início ficou mais perto) avisa na hora, como abrir à mão (PAR-24). _(Nova em 2026-11-23.)_
  - Editar uma partida que vem de uma repetição muda só ela, e não a repetição (PAR-22). _(Nova em 2026-11-23.)_
  - _Por quê:_ ninguém que está dentro é tirado da lista por uma edição. Quem confirmou já se programou.
- **PAR-07. Quem tem `matches.manage` cancela a partida** (`POST /groups/{publicId}/matches/{matchId}/cancel`), até o início. Todos da lista (dentro e fila), menos quem cancelou, recebem o aviso `match_cancelled`. A partida cancelada continua visível até o fim do horário, marcada como cancelada, e ninguém responde nela nem mexe nos convidados (`MATCH_CANCELLED`, 409). Cancelar de novo não muda nada.
  - **Cancelar não apaga nada:** a partida só ganha a data de cancelamento, e as respostas e os convidados ficam como estavam. Nenhum item das partidas expira ou é apagado.
  - _Por quê:_ quem ia jogar precisa saber, e a partida que some sem explicação vira pergunta no WhatsApp. O histórico vai precisar saber também das partidas que não aconteceram.
  - Cancelar uma partida de uma repetição cancela só ela: a da semana seguinte nasce do mesmo jeito (PAR-23).

### Repetir toda semana

- **PAR-20. A repetição é um molde, e cria partidas de verdade.** Ela nasce ao criar a partida com "repetir toda semana" (PAR-01) e guarda:

  | Campo                | De onde vem                                                                           |
  | -------------------- | ------------------------------------------------------------------------------------- |
  | Dia da semana e hora | do início da primeira partida, no fuso da repetição                                   |
  | Duração              | da primeira partida                                                                   |
  | Fuso                 | o de quem cria (o do perfil; sem ele, o do navegador), enviado pela tela (`timeZone`) |
  | Formato e abertura   | nascem vazios, como os da partida (PAR-01); mudam por PAR-22                          |
  - Cada partida criada pela repetição é uma partida como as outras: tem a sua lista, os seus convidados, e se edita (PAR-06) e se cancela (PAR-07) sozinha. Ela vem com a repetição de onde saiu (PAR-16).
  - O grupo tem no máximo **10 repetições ativas** (não encerradas, PAR-23). A 11ª responde `MATCH_SERIES_LIMIT` (409, `details.limit`). As partidas delas contam nas 20 por vir (PAR-01).
  - Um fuso que não existe responde `VALIDATION_ERROR`. Sem o `repeatWeekly`, o `timeZone` é ignorado.
  - _Por quê:_ cada semana é uma partida que aconteceu (ou foi cancelada), e é disso que o histórico vai ser feito. O grupo antigo calculava os jogos sem gravar, e o jogo sem registro complicou remarcar, cancelar e o histórico ([arquivo/grupos.md](arquivo/grupos.md), GRP-10). O fuso fica na repetição porque o grupo não tem fuso (GRV-01): "sexta, 19:00" continua sendo sexta, 19:00 na troca do horário de verão ([ADR 0006](../decisions/0006-datas-utc-fuso-do-perfil.md)). Até 10 cobre quem joga terça e quinta, ou duas turmas no sábado.

- **PAR-21. Existe sempre só a próxima partida da repetição.** Quando ela termina (no fim do horário, cancelada ou não), a seguinte nasce, com o dia, a hora, a duração, o formato e a abertura que a repetição tem naquele momento.
  - A seguinte cai na semana depois do dia previsto da anterior, no dia e na hora da repetição; se esse momento já passou (a rotina ficou parada), na primeira semana em que ele ainda está no futuro. Editar o dia de uma partida (PAR-06) não muda o dia das próximas.
  - Ela nasce mesmo com as 20 partidas por vir: ela toma o lugar da que terminou.
  - Uma rotina cria a seguinte até 15 min depois do fim, e a primeira leitura das partidas do grupo depois do fim (PAR-15, 16) também cria, se a rotina ainda não criou ([ADR 0012](../decisions/0012-rotina-diaria-na-lambda.md)). As duas nunca criam duas.
  - A lista nunca abre antes de a partida existir: se a onda dos membros é de mais de uma semana, a lista abre quando a partida nasce.
  - _Por quê:_ uma por vez deixa a área Partidas com a próxima de cada dia, sem uma fila de semanas que ninguém vai olhar, e faz a mudança da repetição (PAR-22) valer logo na semana seguinte. Responder "não vou" com semanas de antecedência fica de fora (seção 4).
- **PAR-22. Quem tem `matches.manage` muda a repetição** (`PUT /groups/{publicId}/match-series/{seriesId}` com tudo: o dia da semana, a hora, a duração, o formato (ou nenhum), a abertura da lista e o `expectedVersion`, ADR 0016). O fuso não muda.
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
  - Vale para toda partida, da repetição ou não, e para qualquer jeito de abrir: pela hora (PAR-03), à mão (PAR-05) ou por uma edição (PAR-06). Abrindo várias ondas juntas, cada pessoa recebe um aviso só.
  - **A partida criada por uma pessoa não avisa ao nascer:** as ondas abertas na criação (sem abertura configurada, todas) contam como já avisadas, porque quem cria manda a mensagem no WhatsApp (PAR-19). A partida que a repetição cria (PAR-21) avisa ao nascer as ondas que já estão abertas.
  - A primeira configuração da abertura (PAR-06), que faz uma onda voltar a esperar, faz ela avisar de novo quando abrir.
  - Pela hora, o aviso sai por uma rotina a cada 15 min: chega até 15 min depois de a onda abrir. À mão ou por edição, sai na hora. A partida cancelada, ou que já começou, não avisa.
  - _Por quê:_ "lembrar de abrir a lista" e avisar o grupo era a primeira dor de quem organiza. Com a repetição, ninguém cria a partida, então alguém precisa avisar que a lista abriu. O convidado não tem onde receber. Quem já respondeu não precisa do aviso, e quem cria a partida na mão já vai mandar a mensagem: avisar seria repetir.

### Confirmar

- **PAR-08. Quem participa do grupo responde "vou" ou "não vou"** (`PUT /groups/{publicId}/matches/{matchId}/attendance` `{ status }`, com `going` ou `not_going`):
  - "Vou" só com a onda da pessoa aberta: o membro a partir da onda dos membros, a reserva a partir da onda das reservas. Sem a abertura configurada, as duas estão abertas desde a criação (PAR-03). Antes, `MATCH_NOT_OPEN_FOR_YOU` (409, `details.opensAt`). Depois do fechamento, `MATCH_CLOSED`.
  - "Não vou" vale a qualquer momento até o início, mesmo antes da onda da pessoa abrir.
  - Mudar de "vou" para "não vou" tira a pessoa da lista até o início, mesmo depois do fechamento. Depois do início, nenhuma resposta muda (`MATCH_STARTED`).
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
  - _Por quê:_ quem não participa mais não ocupa vaga. Ignorar ao ler evita que sair do grupo tenha que mexer em cada partida.

### Convidados

- **PAR-11. O convidado passa por situações, e só uma delas o põe na lista:**

  | Situação    | Quando                                                  | Na lista? | Conta no limite? |
  | ----------- | ------------------------------------------------------- | --------- | ---------------- |
  | `pending`   | alguém pediu (PAR-12) e ninguém decidiu                 | não       | sim              |
  | `approved`  | quem tem `matches.manage` liberou (PAR-13)              | **sim**   | sim              |
  | `declined`  | quem tem `matches.manage` recusou (PAR-13)              | não       | não              |
  | `cancelled` | quem pediu desistiu do pedido antes da decisão (PAR-14) | não       | não              |
  | `removed`   | saiu da lista depois de liberado (PAR-14)               | não       | não              |
  - Só se passa de `pending` para uma das outras, e de `approved` para `removed`. Nada volta: para trazer de novo, faz-se um pedido novo.
  - Os convidados que não estão mais na lista continuam guardados, com quem decidiu e quando (PAR-07).
  - _Por quê:_ pedir não é jogar. Separar as situações deixa a lista, o limite e o histórico contarem cada uma do jeito certo.

- **PAR-12. Com a onda de convidados aberta (sem configuração, desde a criação, PAR-03), quem participa pede para trazer um convidado** (`POST /groups/{publicId}/matches/{matchId}/guests` `{ name }`): só o nome, de 1 a 40 caracteres, sem os espaços das pontas. O convidado não tem conta e não entra no grupo. Antes da onda, ou com "sem convidados", `MATCH_NOT_OPEN_FOR_YOU`; depois do fechamento, `MATCH_CLOSED`. Quem pede não precisa ter dito "vou".
  - **Sem repetir:** a partida não tem dois convidados `pending` ou `approved` com o mesmo nome (sem diferenciar maiúsculas, acentos e espaços repetidos). O repetido responde `MATCH_GUEST_DUPLICATE` (409). Um nome recusado, cancelado ou removido pode ser pedido de novo.
  - **Limite:** cada partida tem no máximo **30 convidados** `pending` ou `approved`. O 31º responde `MATCH_GUEST_LIMIT` (409, `details.limit`). O nome repetido e o limite são conferidos dentro da própria gravação: dois pedidos ao mesmo tempo nunca passam dos 30 nem repetem o nome.
  - Quem tem `matches.manage` recebe o aviso `match_guest_requested`, com o link da partida. Quem tem a permissão e pede já cria o convidado `approved`, sem aviso.
  - _Por quê:_ o membro conhece o amigo e cadastra o nome; quem organiza decide se ele joga. Sem conta, o convidado não precisa instalar nada para completar o time. O nome repetido é quase sempre o mesmo amigo pedido por duas pessoas.
- **PAR-13. Quem tem `matches.manage` libera** (`POST .../guests/{guestId}/approve`) **ou recusa** (`POST .../guests/{guestId}/decline`) um pedido `pending`. Liberado, o convidado entra na lista como se tivesse dito "vou" naquele instante (PAR-09). Recusado, sai sem aviso. Liberar pede a onda de convidados aberta e a lista não fechada (PAR-04); recusar vale até o início.
  - Decidir um pedido que não está mais `pending` (outro já decidiu, ou quem pediu desistiu) responde `MATCH_GUEST_NOT_PENDING` (409, `details.status`). Um id que não existe responde `MATCH_GUEST_NOT_FOUND` (404).
  - _Por quê:_ a posição é a da liberação, e não a do pedido, para o convidado não passar na frente de quem confirmou enquanto ele esperava.
- **PAR-14. Tirar o convidado** (`DELETE .../guests/{guestId}`), até o início:
  - um `pending`, só quem pediu: vira `cancelled`;
  - um `approved`, quem pediu ou quem tem `matches.manage`: vira `removed`, e a fila sobe (PAR-09).
  - Os outros recebem `GROUP_PERMISSION_DENIED`; um convidado que já saiu, `MATCH_GUEST_NOT_PENDING` com a situação.

### Times

- **PAR-25. Quem tem `matches.manage` salva os times da partida** (`PUT /groups/{publicId}/matches/{matchId}/teams` `{ teams, expectedVersion }`). `teams` é a lista dos times, na ordem ("Time 1", "Time 2"...), e cada time é a lista das pessoas: o id público de quem tem conta ou o id do convidado. _(Nova em 2026-11-24.)_
  - De **2 a 10 times**. Cada pessoa fica em um time só, e só entra num time quem está **dentro** agora (PAR-09): membro, reserva ou convidado liberado. Quem está dentro e não foi posto em nenhum time fica **sem time**. Um time pode ficar vazio.
  - A partida tem uma divisão só: salvar de novo troca a anterior inteira. Não há apagar: para refazer, sorteia-se e salva-se de novo.
  - Salvar manda a `version` dos times que a tela mostrou (0 quando ainda não há times, [ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)); outra responde `VERSION_CONFLICT`.
  - Vale até o fim da partida, inclusive durante o jogo. Depois, `MATCH_FINISHED` (409); na cancelada, `MATCH_CANCELLED`.
  - Uma pessoa repetida, ou um número de times fora de 2 a 10, responde `VALIDATION_ERROR`. Alguém que não está dentro (saiu enquanto a tela estava aberta, ou nunca esteve) responde `MATCH_TEAM_PLAYER_OUT` (409, `details.players`: as pessoas como foram enviadas, `{ kind, id }`), e nada é gravado.
  - A resposta é a partida (PAR-16), já com os times.
  - O número de times não depende do formato (PAR-02): o formato só dá o número que a tela sugere (PAR-26).
  - _Por quê:_ dividir à mão tentando equilibrar era uma das dores de quem organiza. Durante o jogo ainda se troca gente (alguém chegou, alguém se machucou). Quem está na fila não joga, por isso fica fora (seção 4). O formato é o que o grupo combinou para a lista, mas no dia, com 11 dentro numa partida de 2 × 6, os times continuam sendo 2: por isso a divisão guarda o próprio número.
- **PAR-26. O sorteio é uma sugestão da tela, e só vale o que se salva.** Na tela de dividir (PAR-30), quem organiza escolhe o número de times (começa no do formato, ou em 2 sem formato ou com 1 time) e sorteia: a tela espalha ao acaso todos de dentro, com os times de tamanhos que diferem em no máximo 1. Depois, ajusta à mão, trocando as pessoas de time, e salva (PAR-25). Sortear de novo dá outro resultado (é sorte: pode repetir).
  - Nada é gravado antes de salvar: os outros só veem os times salvos, e sair da tela sem salvar descarta o sorteio.
  - Sortear de novo, com times já salvos, só muda a tela: os times salvos continuam valendo até salvar.
  - _Por quê:_ o sorteio resolve "quem fica com quem" sem discussão, e o ajuste resolve o que o sorteio não sabe (os dois melhores no mesmo time). Sem um rascunho gravado, não há "rascunho" e "publicado" para explicar: o que está salvo é o que todos veem. Equilibrar pelo histórico vem depois do resultado (seção 5).
- **PAR-27. Todos que veem a partida veem os times salvos** (PAR-16): cada time com as pessoas, na ordem salva, com o perfil (ou o nome do convidado) e a participação, como nas listas. Sem times salvos, a partida vem sem times.
  - A partida que nasce de uma repetição (PAR-21) nasce sem times: os times não passam de uma semana para a outra.
  - Os times de uma partida que terminou ou foi cancelada ficam guardados, como tudo da partida (PAR-07): é com eles que o resultado vai ser registrado (seção 5).
- **PAR-28. Os times não mudam sozinhos quando a lista muda.** Quem estava num time e não está mais dentro (disse "não vou", saiu do grupo, ou o convidado foi tirado) continua no time, com a marca **saiu da lista**, para todos. Quem passou a estar dentro depois de salvar (confirmou, subiu da fila, convidado liberado) fica **sem time**.
  - Para mudar, quem organiza abre a tela de dividir: ela já começa com os times salvos, sem quem saiu, e com quem está sem time à parte (PAR-30).
  - _Por quê:_ mexer nos times pelas costas de quem organiza seria pior do que mostrar o que mudou. No dia do jogo, "o Fulano saiu do Time 2" é exatamente o que ele precisa ver para decidir.
- **PAR-29. Os times salvos pela primeira vez avisam quem está neles** (`match_teams_ready`, com o link da partida): quem tem conta e está num time, menos quem salvou. Salvar de novo não avisa.
  - _Por quê:_ todo mundo quer saber em que time está, mas cada troca pequena virando aviso seria barulho. Quem precisa saber de uma troca de última hora fica sabendo pela mensagem dos times no WhatsApp (PAR-19).

### Ver

- **PAR-15. Quem participa do grupo vê as próximas partidas** (`GET /groups/{publicId}/matches`): as que ainda não terminaram, canceladas incluídas, pelo início. Cada uma vem com o dia, a hora, a duração, o formato (quando há), a situação (PAR-16), quantos estão dentro, a resposta de quem pede e, quando vem de uma repetição ativa, o dia da semana dela. _(Alterada em 2026-11-23: entrou a repetição.)_
- **PAR-16. Quem participa do grupo vê a partida** (`GET /groups/{publicId}/matches/{matchId}`): os campos de PAR-01, a situação, as ondas com a hora de cada uma, e as listas **dentro**, **fila** e **não vão**, cada pessoa com o perfil (id público, apelido e foto, USR-13) e a participação (membro ou reserva), e cada convidado com o nome e quem o trouxe. Os pedidos de convidado que esperam vêm só para quem tem `matches.manage` e para quem pediu.
  - A situação é calculada pela hora: `scheduled` (antes da onda dos membros, só com a hora dela configurada), `open` (com a onda atual), `closed` (depois do fechamento), `in_progress` (do início ao fim), `finished` e `cancelled`.
  - Vem também o que quem pede pode fazer agora: responder, pedir convidado, e o que a permissão libera.
  - A partida de uma repetição vem com ela: o id, o dia da semana, a hora, a duração, o fuso, o formato, a abertura, se está encerrada e a `version` (para PAR-22). _(Nova em 2026-11-23.)_
  - Com times salvos, vêm os times (PAR-27), cada pessoa com a marca de quem saiu da lista (PAR-28), quem está sem time e a `version` dos times (para PAR-25). _(Nova em 2026-11-24.)_
  - Uma partida que não existe responde `MATCH_NOT_FOUND` (404). Quem não participa do grupo recebe `GROUP_NOT_FOUND`, como em GRV-04.
  - _Por quê:_ todo mundo vê a mesma lista que hoje está no WhatsApp, com a diferença de quem está dentro e quem está na fila.

### Telas (web)

- **PAR-17. A área Partidas** (`/groups/{publicId}/matches`, na barra do grupo, GRV-13) lista as próximas partidas (PAR-15) em cartões: o dia e a hora, "10 de 12" (ou "10 confirmados", sem formato) e a resposta de quem vê ("Você vai", "Você está na fila", "Você não vai" ou nada). Quem tem `matches.manage` vê **Criar partida**, que abre um painel de baixo com três campos: **Dia**, **Hora** e **Duração** livre, em horas e minutos (ex.: 1 h 45), de 1 min até 24 h, que começa em 2 h, e o botão de ligar **Repetir toda semana**, desligado, que, ligado, mostra "Toda sexta às 19:00" pelo dia e pela hora escolhidos (PAR-20). Criada, a pessoa vai para a página da partida. A partida de uma repetição ativa tem, no cartão, a marca "Toda sexta". _(Alterada em 2026-11-23: entrou repetir toda semana.)_ _(Alterada em 2026-11-23: antes, o painel tinha todos os campos de PAR-01. Alterada de novo em 2026-11-23: a duração era de 30 em 30 min, e um grupo que joga 1 h 45 não cabia. Saíram também os atalhos 1 h, 1 h 30, 2 h e 3 h: só os dois campos.)_
- **PAR-18. A página da partida** (`/groups/{publicId}/matches/{matchId}`, o link que vai no WhatsApp) mostra:
  - o dia, a hora e a abertura em uma linha ("Lista aberta para membros · reservas a partir de qui, 19:00"; sem configuração, "Lista aberta");
  - os botões **Vou** e **Não vou**, com a resposta atual marcada, e **Trazer convidado** quando a onda de convidados está aberta;
  - com times salvos, a seção **Times**, antes das listas: cada time com o número de pessoas e as pessoas, o time de quem vê marcado como **Seu time**, a marca **saiu da lista** (PAR-28) e, embaixo, **Sem time** quando há alguém (PAR-27, 28). _(Nova em 2026-11-24.)_
  - as listas **Confirmados (10 de 12)** (sem formato, **Confirmados (10)**), **Fila** e **Não vão**, numeradas, com a marca "reserva" e "convidado de Fulano";
  - para quem tem `matches.manage`: os pedidos de convidado com **Liberar** e **Recusar**, **Abrir para as reservas agora** ou **Abrir para convidados agora** (PAR-05), **Dividir times** (ou **Mudar times**, com times salvos; até o fim da partida, PAR-25, 30), as **Configurações da partida** e **Cancelar partida**, com confirmação.
  - **Configurações da partida** é uma lista agrupada, como as Configurações do grupo (GRV-14): cada linha tem o nome, o valor atual e a seta, e tocar abre um painel de baixo só com aquilo (PAR-06):

    | Linha             | Valor atual                                                                            | O painel                                                                                            |
    | ----------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
    | Dia e hora        | "sex, 27/11 · 19:00 · 2 h"                                                             | dia, hora e duração, como no criar                                                                  |
    | Formato           | "2 times de 6 · 12 vagas", ou "Sem limite de vagas"                                    | times e pessoas por time, ou sem formato                                                            |
    | Abertura da lista | "Membros 72 h antes · Reservas 24 h antes · Convidados 6 h antes", ou "Aberta a todos" | para membros, reservas e convidados: "desde já" ou as horas antes; "sem convidados"; e o fechamento |
    | Repetição         | "Toda sexta · 19:00 · 2 h", ou "Encerrada" (só na partida de uma repetição)            | o que a repetição tem (PAR-20) e **Encerrar repetição**, com confirmação (PAR-23)                   |

  - **Na partida de uma repetição ativa,** os painéis de Dia e hora, Formato e Abertura da lista têm o botão de ligar **Também nas próximas semanas**: ligado, salvar muda a partida (PAR-06) e a repetição (PAR-22). Ele começa ligado no Formato e na Abertura, e desligado no Dia e hora, que costuma mudar só uma semana. _(Nova em 2026-11-23.)_
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
  - Ao salvar com `MATCH_TEAM_PLAYER_OUT`, a tela relê a partida, tira quem saiu, mantém o resto como estava e avisa ("Fulano saiu da lista. Confira e salve de novo."). Com `VERSION_CONFLICT`, ela relê os times salvos e avisa ("Alguém mudou os times antes de você. Atualizamos; faça a mudança de novo.").
  - _Por quê:_ dividir tem muitos controles e precisa do espaço da tela inteira; a página da partida continua sendo a do "eu vou?". Abrir já sorteado faz o caso comum (sortear e salvar) ser um toque.

## 3. Como funciona

### Dados (na partição do grupo, ADR 0014)

| Item              | Chave                                                       | Para quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partida           | `GROUP#<g>` / `MATCH#<matchId>`                             | entidade (`newEntity`): `startsAt`, `endsAt` (UTC, ADR 0006; a duração é a diferença), `teams` e `playersPerTeam` (os dois ou nenhum: sem formato), as ondas em horas, cada uma ausente quando não configurada (`membersHours`, `reservesHours`, `guestsHours`), `noGuests` ("sem convidados"), `closeHours` (0 sem configurar), `advancedTo` (PAR-05), `notifiedWave` (a maior onda já avisada, PAR-24; gravar ele não soma a `version`, e a edição não o regrava, a não ser na primeira configuração da abertura), `seriesId` e `seriesDate` (a repetição e o dia previsto, no fuso dela, PAR-21; só na partida de uma repetição), `cancelledAt`, `createdBy`, `version`. As partidas do grupo são uma Query `begins_with(SK, "MATCH#")`, com as que já terminaram descartadas |
| Resposta          | `GROUP#<g>` / `MATCHATT#<matchId>#<userId>`                 | entidade de relação (ADR 0009): `status` (`going` ou `not_going`), `respondedAt` (a hora da resposta atual, que dá a ordem). As respostas da partida são uma Query `begins_with(SK, "MATCHATT#<matchId>#")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Convidado         | `GROUP#<g>` / `MATCHGUEST#<matchId>#<guestId>`              | entidade: `name`, `requestedBy`, e a data e quem de cada passo (`approvedAt`/`approvedBy`, `declinedAt`/`declinedBy`, `cancelledAt`, `removedAt`/`removedBy`). A situação (PAR-11) é calculada desses campos; a ordem na lista é o `approvedAt`. Os convidados da partida são uma Query `begins_with(SK, "MATCHGUEST#<matchId>#")`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Convidados ativos | `GROUP#<g>` / `MATCHGUESTS#<matchId>`                       | contador (`active`, os `pending` + `approved`), que muda com `ADD` na mesma transação do convidado, com a condição `active < 30` ao pedir (PAR-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Nome do convidado | `GROUP#<g>` / `MATCHGUESTNAME#<matchId>#<nome normalizado>` | `{ guestId }`, gravado com `attribute_not_exists` ao pedir e apagado ao recusar, cancelar ou remover, na mesma transação (PAR-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Repetição         | `GROUP#<g>` / `MATCHSERIES#<seriesId>`                      | entidade: `weekday` (1 a 7, segunda a domingo), `time` (`HH:mm`), `durationMinutes`, `timeZone` (IANA), o formato e a abertura como na partida, `currentMatchId` e `currentDate` (a próxima partida e o dia previsto dela), `endedAt`, `createdBy`, `version`. As do grupo são uma Query `begins_with(SK, "MATCHSERIES#")` (o limite de PAR-20 conta as sem `endedAt`)                                                                                                                                                                                                                                                                                                                                                                                                           |
| Times             | `GROUP#<g>` / `MATCHTEAMS#<matchId>`                        | `teams`: a lista dos times, na ordem, e cada time a lista das pessoas (`{ kind: 'user' \| 'guest', id }`, com o uuid do usuário ou o id do convidado; a api traduz o id público na entrada). `createdAt` e `createdBy` (o primeiro salvar, PAR-29), `updatedAt`, `updatedBy`, `version`. Chave natural pela partida (ADR 0009): um item por partida, sem lookup. O primeiro salvar grava com `attribute_not_exists` (a `version` esperada é 0), e quem ganha essa condição avisa. Não guarda "sem time" nem "saiu da lista": os dois são calculados ao ler, comparando com a lista de dentro (PAR-28)                                                                                                                                                                            |
| Agenda            | `MATCHAGENDA#<AAAA-MM-DDTHH>` / `<instante>#<g>#<matchId>`  | `{ groupId, matchId, publicId, groupName }`: "olhe esta partida neste instante", com o id público e o nome do grupo para a rotina montar o aviso sem ler o grupo (o nome não muda, GRV-01). Gravado ao criar e ao editar a partida, um para cada onda configurada (PAR-24) e, na partida de uma repetição, um para o fim (PAR-21). A partição é a hora (UTC). Regravar o mesmo item (a edição regrava os da partida) mantém o `createdAt` de quando ele foi gravado a primeira vez. Apagado depois de tratado; `ttl` de 7 dias depois do instante, como reserva (ADR 0004). Não é dado da partida: a regra "nada das partidas expira" (PAR-07) não vale para ele                                                                                                                 |
| Rotina            | `ROUTINE#MATCHAGENDA` / `META`                              | `lastRunAt`: até onde a rotina já leu a agenda                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

- **A lista é calculada ao ler** (PAR-09): as respostas `going` de quem ainda participa (PAR-10) e os convidados `approved`, juntos, por `respondedAt` ou `approvedAt` (a hora do servidor, ISO em UTC com milissegundos) e, no empate, pelo id (o `userId` ou o `guestId`). As posições de 1 até as vagas estão dentro; as outras, na fila. Sem formato, todas estão dentro.
- **O aviso de promoção** (PAR-09) sai de comparar a lista de dentro antes e depois da gravação: a leitura de antes, a gravação, e uma leitura consistente depois.
- A onda atual sai de `startsAt`, das horas de cada onda (a ausente abre com a anterior, e a dos membros desde a criação), do `noGuests` e do `advancedTo`. Abrir à mão (PAR-05) e editar (PAR-06) gravam em `advancedTo` a onda aberta naquela hora, quando ela é maior: é isso que impede a onda de voltar. A situação (PAR-16) também é calculada; não há campo de status.
- **A rotina** (`matchesAgenda`, evento `schedule` a cada 15 min, no `functions.ts` do módulo, ADR 0012) lê as partições da agenda da hora do `lastRunAt` até a hora atual (no máximo as últimas 48 h), trata cada item com instante até agora e o apaga. Cada item é tratado sozinho: o que falha é registrado no log e fica na agenda, e os outros seguem. O `lastRunAt` para na hora do primeiro item que falhou, então a próxima execução tenta de novo só os que sobraram, até eles saírem das 48 h. Tratar é reler a partida e decidir pela verdade dela, então um item velho (a partida mudou de hora depois) não faz nada errado, e tratar duas vezes não duplica:
  - **aviso:** se a onda atual é maior que o `notifiedWave` e a partida não foi cancelada nem começou, grava a onda atual em `notifiedWave` com a condição de ele não ter mudado, e só então avisa (PAR-24). Quem ganhou a condição avisa; o outro, não;
  - **a próxima da repetição:** se a partida terminou, é a `currentMatchId` da repetição e a repetição não foi encerrada, cria a seguinte numa transação: a partida nova, os itens de agenda dela, e a repetição com o `currentMatchId` e o `currentDate` novos, com a condição de o `currentMatchId` ainda ser o da que terminou. A leitura das partidas (PAR-15, 16) faz o mesmo para as repetições do grupo cuja próxima já terminou. Na partida nova, o `notifiedWave` fica vazio: as ondas abertas ao nascer avisam no mesmo tratamento.
- A partida criada por uma pessoa (PAR-01) grava o `notifiedWave` com a onda aberta na criação. Abrir à mão (PAR-05) e editar (PAR-06) fazem a mesma conferência do aviso dentro da requisição, depois da gravação. A primeira configuração da abertura grava o `notifiedWave` com a onda que vale depois dela.
- **Os times** (PAR-25–28) são lidos junto com a partida, num GetItem a mais. O sorteio (PAR-26) roda só na web (`web/src/modules/matches/match.teams.ts`, puro e testado): a api só confere e grava o que se salva. Conferir quem está dentro ao salvar usa a mesma lista calculada da leitura (PAR-09).
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
| `POST /groups/{publicId}/matches/{matchId}/cancel`              | `matches.manage`               | PAR-07         |
| `PUT /groups/{publicId}/matches/{matchId}/attendance`           | quem participa                 | PAR-08, 09     |
| `POST /groups/{publicId}/matches/{matchId}/guests`              | quem participa                 | PAR-11, 12     |
| `POST /groups/{publicId}/matches/{matchId}/guests/{id}/approve` | `matches.manage`               | PAR-11, 13     |
| `POST /groups/{publicId}/matches/{matchId}/guests/{id}/decline` | `matches.manage`               | PAR-11, 13     |
| `DELETE /groups/{publicId}/matches/{matchId}/guests/{id}`       | quem pediu ou `matches.manage` | PAR-11, 14     |
| `PUT /groups/{publicId}/matches/{matchId}/teams`                | `matches.manage`               | PAR-25, 28, 29 |
| `PUT /groups/{publicId}/match-series/{seriesId}`                | `matches.manage`               | PAR-22         |
| `POST /groups/{publicId}/match-series/{seriesId}/end`           | `matches.manage`               | PAR-23         |
| rotina `matchesAgenda` (a cada 15 min)                          | —                              | PAR-21, 24     |

Erros: `VALIDATION_ERROR`, `GROUP_NOT_FOUND`, `GROUP_PERMISSION_DENIED`, `MATCH_NOT_FOUND` (404), `MATCH_LIMIT` (409, `details.limit`), `MATCH_SERIES_NOT_FOUND` (404), `MATCH_SERIES_LIMIT` (409, `details.limit`), `MATCH_SERIES_ENDED` (409), `MATCH_NOT_OPEN_FOR_YOU` (409, `details.opensAt`, ausente com "sem convidados"), `MATCH_CLOSED` (409), `MATCH_STARTED` (409), `MATCH_FINISHED` (409), `MATCH_CANCELLED` (409), `MATCH_TEAM_PLAYER_OUT` (409, `details.players`), `MATCH_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed`), `MATCH_GUEST_NOT_FOUND` (404), `MATCH_GUEST_NOT_PENDING` (409, `details.status`), `MATCH_GUEST_DUPLICATE` (409), `MATCH_GUEST_LIMIT` (409, `details.limit`), `VERSION_CONFLICT`. Avisos: `match_promoted`, `match_cancelled`, `match_guest_requested`, `match_list_open`, `match_teams_ready`.

## 4. Limites conhecidos

- A repetição é só semanal, e só existe a próxima partida de cada uma: não dá para responder "não vou" para daqui a duas semanas (PAR-21).
- Mudar a repetição não muda a próxima partida, que já existe (PAR-22): a tela oferece mudar as duas.
- Encerrar a repetição não se desfaz, e não há pausa (PAR-23).
- O aviso de lista aberta pela hora chega até 15 min depois de a onda abrir, e a próxima da repetição nasce até 15 min depois do fim (ou na primeira leitura). No dev local, ela roda sozinha com o `npm run dev` de pé, e na hora com `npm run invoke:scorely -- matchesAgenda` (ADR 0012).
- Um item da agenda que falha por mais de 48 h é deixado de lado: o aviso daquela onda não sai, e a próxima da repetição fica para a primeira leitura das partidas do grupo (PAR-21). O log é o que mostra o que falhou.
- Se o envio do aviso de lista aberta falha depois de a onda ser marcada em `notifiedWave`, aquele aviso não sai de novo: marcar antes de avisar é o que impede o aviso duplicado (PAR-24).
- Não há lembrete além do aviso de lista aberta (ex.: "falta 1", "a lista fecha em 1 h").
- A partida criada à mão não avisa ao nascer, nem as ondas já abertas (PAR-24).
- A fila que sobe porque alguém saiu do grupo (PAR-10) não avisa quem subiu.
- O aviso de promoção (PAR-09) é a melhor tentativa: com duas saídas no mesmo instante, quem subiu pode não ser avisado, ou ser avisado duas vezes. A lista, essa, está sempre certa: o aviso não decide quem está dentro.
- Não há reabrir uma partida cancelada nem apagar uma partida: cancelar é o fim.
- Quem organiza não tira um participante da lista (só convidados, PAR-14). Quem faltou sem avisar continua na lista.
- O convidado não tem histórico: é só um nome naquela partida.
- Partidas do mesmo grupo podem se sobrepor no horário.
- As partidas que terminaram não aparecem em lugar nenhum até o histórico (etapa 4).
- O sorteio é só ao acaso: não equilibra por nada, nem por gênero (PAR-26). O equilíbrio fica com o ajuste à mão.
- Não há fixar alguém num time antes de sortear: sortear de novo espalha todo mundo (PAR-26).
- Quem está na fila não entra num time (PAR-25). Se alguém da fila joga no lugar de quem não veio, quem organiza muda a lista antes (o atrasado diz "não vou", e a fila sobe).
- Os times se chamam só "Time 1", "Time 2"..., sem nome nem cor.
- Mudar os times depois do primeiro salvar não avisa ninguém (PAR-29).

## 5. Em discussão (ainda não é regra)

- **Próximas etapas, nesta ordem** (conversa de produto de 2026-11-23): resultado e histórico (registrado sobre os times salvos, PAR-27) → ranking e temporada (o campeonato interno). O sorteio ajustável entrou em 2026-11-24 (PAR-25–30). _(Alterada em 2026-11-24.)_
- **Times, depois:** equilibrar o sorteio pelo histórico (sem nível técnico), quando houver resultado; espalhar homens e mulheres (o perfil já tem o gênero, USR); fixar alguém num time antes de sortear; nome ou cor do time (o colete); e quem está na fila num time. Equilibrar pelo histórico leva o sorteio para a api, que tem os resultados.
- **Local da partida:** saiu em 2026-11-23. Não vai ser texto livre; o jeito (lugares cadastrados no grupo, endereço, mapa) fica para decidir.
- **Recado da partida** (o "FERIADO!"): saiu em 2026-11-23, como o local. Volta se fizer falta, decidido de novo.
- **Modelo Organizador** (GRV-51), com `matches.manage`, quando houver mais de uma permissão de partida.
