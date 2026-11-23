# Módulo Partidas

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-23.

Código: `apps/scorely/api/src/modules/matches/`, `apps/scorely/web/src/modules/matches/`. Contrato: `apps/scorely/contracts/src/matches.ts`.

## 1. Para que serve

**O grupo reúne as pessoas. A partida reúne as pessoas para jogar. O histórico registra o que aconteceu.** Por isso a partida não apaga nada do que aconteceu nela (PAR-07, 11): o histórico (seção 5) vai ser feito a partir disso.

Tirar a lista do jogo do WhatsApp. Quem organiza cria a partida, manda a mensagem pronta no grupo do WhatsApp, e cada pessoa confirma pelo link. A partida nasce limpa: lista aberta a todos e sem limite de vagas. Quem quiser configura o formato (as vagas) e a abertura da lista, que faz a lista encher em ondas, sozinha, pelo horário: primeiro os membros, depois as reservas e, se ainda sobrar vaga, convidados de fora, só com o nome. Os times, o resultado e a repetição toda semana entram nas próximas etapas (seção 5).

Caso de referência: a Ana cria a partida de sexta, às 19h, e configura 2 times de 6 e a abertura da lista. A lista abre para os membros na terça. Na quinta ainda faltam 3, e ela abre para as reservas. Na sexta de manhã falta 1, e o Edu pede para trazer o primo, só com o nome. A Ana libera. Cada vez que a lista muda, ela copia a mensagem e cola no WhatsApp.

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
  - A onda é calculada pela hora, ao ler: não há agendador. Abrir a onda pela hora não avisa ninguém (seção 4).
  - _Por quê:_ a preferência dos membros é a onda: eles têm a lista só para eles primeiro. Ninguém precisa lembrar de abrir para as reservas, que era a primeira dor de quem organiza. Em horas antes do início, a configuração continua valendo quando a partida muda de dia, e é a mesma que a repetição semanal vai usar. Sem configurar, a partida funciona como a lista do WhatsApp: quem vê, confirma. "Onda" é palavra nossa; na tela, "Abertura da lista" diz o que é. _(Alterada em 2026-11-23: antes, as ondas nasciam em 72/24/6 h, e a onda de convidados ausente era desligada.)_
- **PAR-04. A lista fecha em horas antes do início** (de 0, sem configurar, até a onda configurada mais tarde). Depois do fechamento, ninguém entra (`MATCH_CLOSED`, 409), mas quem está na lista ainda pode desistir até o início (PAR-08).
  - _Por quê:_ quem organiza precisa de um momento em que a lista para de mudar para montar os times. Desistir continua valendo: é melhor saber antes de chegar à quadra.
- **PAR-05. Quem tem `matches.manage` abre a próxima onda antes da hora** (`POST /groups/{publicId}/matches/{matchId}/advance` `{ wave }`, com `wave` = `reserves` ou `guests`). A onda pedida e as anteriores ficam abertas na hora. Abrir uma onda que já está aberta não muda nada. Os convidados abrem assim mesmo com a onda deles desligada. Depois do fechamento, `MATCH_CLOSED`.
  - Sem a abertura configurada, tudo já está aberto, e não há o que abrir.
  - **Abrir antes não se desfaz:** uma onda aberta, pela hora ou à mão, não fecha mais (PAR-06).
  - _Por quê:_ às vezes a quarta-feira já mostra que os membros não vão fechar. Esperar a hora só atrasa quem quer jogar.
- **PAR-06. Quem tem `matches.manage` muda as configurações da partida** (`PUT /groups/{publicId}/matches/{matchId}` com todas as configurações: o início e o fim, o formato (ou nenhum) e a abertura da lista (as horas configuradas, "sem convidados" e o fechamento), e o `expectedVersion`, [ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)), até o início (depois, `MATCH_STARTED`, 409). _(Alterada em 2026-11-23: antes, "edita a partida", com o local e o recado.)_
  - Diminuir as vagas abaixo de quem já está dentro responde `MATCH_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed`).
  - Aumentar as vagas faz a fila subir, com o aviso de PAR-09.
  - Mudar a hora não tira ninguém da lista. As ondas acompanham o início (PAR-03), mas **a onda atual nunca volta**: se a edição faria uma onda já aberta fechar (o início foi para depois, ou as horas diminuíram), ela continua aberta (PAR-05).
  - **A primeira configuração da abertura passa a valer:** a lista que estava aberta a todos só por não ter abertura configurada (PAR-03) segue as horas novas. Se ainda não é a hora das reservas, a reserva volta a esperar. Quem já confirmou continua na lista (PAR-09). O "nunca volta" vale para a onda aberta por uma hora configurada ou à mão (PAR-05). _(Nova em 2026-11-23.)_
  - _Por quê:_ ninguém que está dentro é tirado da lista por uma edição. Quem confirmou já se programou.
- **PAR-07. Quem tem `matches.manage` cancela a partida** (`POST /groups/{publicId}/matches/{matchId}/cancel`), até o início. Todos da lista (dentro e fila), menos quem cancelou, recebem o aviso `match_cancelled`. A partida cancelada continua visível até o fim do horário, marcada como cancelada, e ninguém responde nela nem mexe nos convidados (`MATCH_CANCELLED`, 409). Cancelar de novo não muda nada.
  - **Cancelar não apaga nada:** a partida só ganha a data de cancelamento, e as respostas e os convidados ficam como estavam. Nenhum item das partidas expira ou é apagado.
  - _Por quê:_ quem ia jogar precisa saber, e a partida que some sem explicação vira pergunta no WhatsApp. O histórico vai precisar saber também das partidas que não aconteceram.

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

### Ver

- **PAR-15. Quem participa do grupo vê as próximas partidas** (`GET /groups/{publicId}/matches`): as que ainda não terminaram, canceladas incluídas, pelo início. Cada uma vem com o dia, a hora, a duração, o formato (quando há), a situação (PAR-16), quantos estão dentro e a resposta de quem pede.
- **PAR-16. Quem participa do grupo vê a partida** (`GET /groups/{publicId}/matches/{matchId}`): os campos de PAR-01, a situação, as ondas com a hora de cada uma, e as listas **dentro**, **fila** e **não vão**, cada pessoa com o perfil (id público, apelido e foto, USR-13) e a participação (membro ou reserva), e cada convidado com o nome e quem o trouxe. Os pedidos de convidado que esperam vêm só para quem tem `matches.manage` e para quem pediu.
  - A situação é calculada pela hora: `scheduled` (antes da onda dos membros, só com a hora dela configurada), `open` (com a onda atual), `closed` (depois do fechamento), `in_progress` (do início ao fim), `finished` e `cancelled`.
  - Vem também o que quem pede pode fazer agora: responder, pedir convidado, e o que a permissão libera.
  - Uma partida que não existe responde `MATCH_NOT_FOUND` (404). Quem não participa do grupo recebe `GROUP_NOT_FOUND`, como em GRV-04.
  - _Por quê:_ todo mundo vê a mesma lista que hoje está no WhatsApp, com a diferença de quem está dentro e quem está na fila.

### Telas (web)

- **PAR-17. A área Partidas** (`/groups/{publicId}/matches`, na barra do grupo, GRV-13) lista as próximas partidas (PAR-15) em cartões: o dia e a hora, "10 de 12" (ou "10 confirmados", sem formato) e a resposta de quem vê ("Você vai", "Você está na fila", "Você não vai" ou nada). Quem tem `matches.manage` vê **Criar partida**, que abre um painel de baixo com três campos: **Dia**, **Hora** e **Duração** livre, em horas e minutos (ex.: 1 h 45), de 1 min até 24 h, que começa em 2 h. Criada, a pessoa vai para a página da partida. _(Alterada em 2026-11-23: antes, o painel tinha todos os campos de PAR-01. Alterada de novo em 2026-11-23: a duração era de 30 em 30 min, e um grupo que joga 1 h 45 não cabia. Saíram também os atalhos 1 h, 1 h 30, 2 h e 3 h: só os dois campos.)_
- **PAR-18. A página da partida** (`/groups/{publicId}/matches/{matchId}`, o link que vai no WhatsApp) mostra:
  - o dia, a hora e a abertura em uma linha ("Lista aberta para membros · reservas a partir de qui, 19:00"; sem configuração, "Lista aberta");
  - os botões **Vou** e **Não vou**, com a resposta atual marcada, e **Trazer convidado** quando a onda de convidados está aberta;
  - as listas **Confirmados (10 de 12)** (sem formato, **Confirmados (10)**), **Fila** e **Não vão**, numeradas, com a marca "reserva" e "convidado de Fulano";
  - para quem tem `matches.manage`: os pedidos de convidado com **Liberar** e **Recusar**, **Abrir para as reservas agora** ou **Abrir para convidados agora** (PAR-05), as **Configurações da partida** e **Cancelar partida**, com confirmação.
  - **Configurações da partida** é uma lista agrupada, como as Configurações do grupo (GRV-14): cada linha tem o nome, o valor atual e a seta, e tocar abre um painel de baixo só com aquilo (PAR-06):

    | Linha             | Valor atual                                                                            | O painel                                                                                            |
    | ----------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
    | Dia e hora        | "sex, 27/11 · 19:00 · 2 h"                                                             | dia, hora e duração, como no criar                                                                  |
    | Formato           | "2 times de 6 · 12 vagas", ou "Sem limite de vagas"                                    | times e pessoas por time, ou sem formato                                                            |
    | Abertura da lista | "Membros 72 h antes · Reservas 24 h antes · Convidados 6 h antes", ou "Aberta a todos" | para membros, reservas e convidados: "desde já" ou as horas antes; "sem convidados"; e o fechamento |
  - _(Alterada em 2026-11-23: antes, um Editar com todos os campos num painel só. Alterada de novo em 2026-11-23: "Ondas" virou "Abertura da lista", e saiu o Recado.)_
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

## 3. Como funciona

### Dados (na partição do grupo, ADR 0014)

| Item              | Chave                                                       | Para quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partida           | `GROUP#<g>` / `MATCH#<matchId>`                             | entidade (`newEntity`): `startsAt`, `endsAt` (UTC, ADR 0006; a duração é a diferença), `teams` e `playersPerTeam` (os dois ou nenhum: sem formato), as ondas em horas, cada uma ausente quando não configurada (`membersHours`, `reservesHours`, `guestsHours`), `noGuests` ("sem convidados"), `closeHours` (0 sem configurar), `advancedTo` (PAR-05), `cancelledAt`, `createdBy`, `version`. As partidas do grupo são uma Query `begins_with(SK, "MATCH#")`, com as que já terminaram descartadas |
| Resposta          | `GROUP#<g>` / `MATCHATT#<matchId>#<userId>`                 | entidade de relação (ADR 0009): `status` (`going` ou `not_going`), `respondedAt` (a hora da resposta atual, que dá a ordem). As respostas da partida são uma Query `begins_with(SK, "MATCHATT#<matchId>#")`                                                                                                                                                                                                                                                                                         |
| Convidado         | `GROUP#<g>` / `MATCHGUEST#<matchId>#<guestId>`              | entidade: `name`, `requestedBy`, e a data e quem de cada passo (`approvedAt`/`approvedBy`, `declinedAt`/`declinedBy`, `cancelledAt`, `removedAt`/`removedBy`). A situação (PAR-11) é calculada desses campos; a ordem na lista é o `approvedAt`. Os convidados da partida são uma Query `begins_with(SK, "MATCHGUEST#<matchId>#")`                                                                                                                                                                  |
| Convidados ativos | `GROUP#<g>` / `MATCHGUESTS#<matchId>`                       | contador (`active`, os `pending` + `approved`), que muda com `ADD` na mesma transação do convidado, com a condição `active < 30` ao pedir (PAR-12)                                                                                                                                                                                                                                                                                                                                                  |
| Nome do convidado | `GROUP#<g>` / `MATCHGUESTNAME#<matchId>#<nome normalizado>` | `{ guestId }`, gravado com `attribute_not_exists` ao pedir e apagado ao recusar, cancelar ou remover, na mesma transação (PAR-12)                                                                                                                                                                                                                                                                                                                                                                   |

- **A lista é calculada ao ler** (PAR-09): as respostas `going` de quem ainda participa (PAR-10) e os convidados `approved`, juntos, por `respondedAt` ou `approvedAt` (a hora do servidor, ISO em UTC com milissegundos) e, no empate, pelo id (o `userId` ou o `guestId`). As posições de 1 até as vagas estão dentro; as outras, na fila. Sem formato, todas estão dentro.
- **O aviso de promoção** (PAR-09) sai de comparar a lista de dentro antes e depois da gravação: a leitura de antes, a gravação, e uma leitura consistente depois.
- A onda atual sai de `startsAt`, das horas de cada onda (a ausente abre com a anterior, e a dos membros desde a criação), do `noGuests` e do `advancedTo`. Abrir à mão (PAR-05) e editar (PAR-06) gravam em `advancedTo` a onda aberta naquela hora, quando ela é maior: é isso que impede a onda de voltar. A situação (PAR-16) também é calculada; não há campo de status.
- **Partidas e grupo:** o módulo de partidas pergunta ao grupo só quem participa, como (membro ou reserva) e se a pessoa tem uma permissão (GRV-15). O grupo não sabe nada das partidas: as ondas, a lista, a fila e os convidados ficam todos aqui.
- Responder não usa `version`: é uma disputa por lugar, e a ordem de chegada decide (ADR 0016).

### Rotas

| Rota                                                            | Quem                           | Regras     |
| --------------------------------------------------------------- | ------------------------------ | ---------- |
| `POST /groups/{publicId}/matches`                               | `matches.manage`               | PAR-01–04  |
| `GET /groups/{publicId}/matches`                                | quem participa                 | PAR-15     |
| `GET /groups/{publicId}/matches/{matchId}`                      | quem participa                 | PAR-16, 10 |
| `PUT /groups/{publicId}/matches/{matchId}`                      | `matches.manage`               | PAR-06     |
| `POST /groups/{publicId}/matches/{matchId}/advance`             | `matches.manage`               | PAR-05     |
| `POST /groups/{publicId}/matches/{matchId}/cancel`              | `matches.manage`               | PAR-07     |
| `PUT /groups/{publicId}/matches/{matchId}/attendance`           | quem participa                 | PAR-08, 09 |
| `POST /groups/{publicId}/matches/{matchId}/guests`              | quem participa                 | PAR-11, 12 |
| `POST /groups/{publicId}/matches/{matchId}/guests/{id}/approve` | `matches.manage`               | PAR-11, 13 |
| `POST /groups/{publicId}/matches/{matchId}/guests/{id}/decline` | `matches.manage`               | PAR-11, 13 |
| `DELETE /groups/{publicId}/matches/{matchId}/guests/{id}`       | quem pediu ou `matches.manage` | PAR-11, 14 |

Erros: `VALIDATION_ERROR`, `GROUP_NOT_FOUND`, `GROUP_PERMISSION_DENIED`, `MATCH_NOT_FOUND` (404), `MATCH_LIMIT` (409, `details.limit`), `MATCH_NOT_OPEN_FOR_YOU` (409, `details.opensAt`, ausente com "sem convidados"), `MATCH_CLOSED` (409), `MATCH_STARTED` (409), `MATCH_CANCELLED` (409), `MATCH_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed`), `MATCH_GUEST_NOT_FOUND` (404), `MATCH_GUEST_NOT_PENDING` (409, `details.status`), `MATCH_GUEST_DUPLICATE` (409), `MATCH_GUEST_LIMIT` (409, `details.limit`), `VERSION_CONFLICT`. Avisos: `match_promoted`, `match_cancelled`, `match_guest_requested`.

## 4. Limites conhecidos

- A partida é criada à mão, uma por vez. Não há repetição toda semana (etapa 2).
- Abrir uma onda pela hora não avisa ninguém, e não há lembrete: o aviso precisa de um agendador, que entra com a repetição.
- A fila que sobe porque alguém saiu do grupo (PAR-10) não avisa quem subiu.
- O aviso de promoção (PAR-09) é a melhor tentativa: com duas saídas no mesmo instante, quem subiu pode não ser avisado, ou ser avisado duas vezes. A lista, essa, está sempre certa: o aviso não decide quem está dentro.
- Não há reabrir uma partida cancelada nem apagar uma partida: cancelar é o fim.
- Quem organiza não tira um participante da lista (só convidados, PAR-14). Quem faltou sem avisar continua na lista.
- O convidado não tem histórico: é só um nome naquela partida.
- Partidas do mesmo grupo podem se sobrepor no horário.
- As partidas que terminaram não aparecem em lugar nenhum até o histórico (etapa 4).

## 5. Em discussão (ainda não é regra)

- **Próximas etapas, nesta ordem** (conversa de produto de 2026-11-23): repetir toda semana, com o aviso de lista aberta → dividir os times (sorteio ajustável, depois equilibrado pelo histórico, sem nível técnico) → resultado e histórico → ranking e temporada (o campeonato interno).
- **Local da partida:** saiu em 2026-11-23. Não vai ser texto livre; o jeito (lugares cadastrados no grupo, endereço, mapa) fica para decidir.
- **Recado da partida** (o "FERIADO!"): saiu em 2026-11-23, como o local. Volta se fizer falta, decidido de novo.
- **Modelo Organizador** (GRV-51), com `matches.manage`, quando houver mais de uma permissão de partida.
