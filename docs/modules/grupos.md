# Módulo Grupos

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Se o código e este doc discordarem, um dos dois está errado. Conferido com o código em 2026-11-15.

Código: `apps/scorely/api/src/modules/groups/`, `apps/scorely/web/src/modules/groups/`, contrato em `apps/scorely/contracts/src/groups.ts`.

## 1. Para que serve

Grupo esportivo recorrente (a "pelada" da semana). Resultado esperado: **o jogo da semana acontece sem confusão de lista**. Mais tarde, também com times equilibrados (E3 em diante, ver [PRODUCT.md](../product/PRODUCT.md)).

Caso de referência: vôlei misto de sexta, com 12 vagas. Os membros fixos têm prioridade. Se sobra vaga, entram as reservas e depois qualquer pessoa com o link do jogo.

### Vocabulário

| Termo               | Significado                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dono                | quem criou o grupo, ou quem o recebeu numa transferência (GRP-54). Há um só, ele é membro e tem o cargo Dono                    |
| Cargo               | o que a pessoa pode administrar no grupo: Dono, Admin ou Membro (sem permissões). Todos têm um, e ele não muda o papel (GRP-48) |
| Permissão           | uma ação de administração liberada por um cargo, como `game.manage` (GRP-49)                                                    |
| Membro              | participa do grupo e tem a janela de confirmação mais cedo                                                                      |
| Reserva             | participa do grupo e confirma depois dos membros                                                                                |
| Convidado           | não participa do grupo; confirma pelo link do jogo, depois das reservas                                                         |
| Lugar               | onde o grupo joga, salvo com nome, endereço e o ponto no mapa (GRP-60). O grupo tem um lugar padrão (GRP-62)                    |
| Esporte             | o esporte do grupo, do catálogo ([esportes.md](esportes.md)). Um só, e não muda (GRP-58)                                        |
| Jogo                | a ocorrência semanal do grupo. Só existe o **jogo atual**                                                                       |
| Camada              | janela de quando cada papel pode confirmar: membros → reservas → convidados                                                     |
| Lista               | quem confirmou, na ordem de chegada. As primeiras `vagas` pessoas estão **dentro**                                              |
| Fila                | quem confirmou com as vagas já ocupadas (o "Banco" na tela). Sobe sozinho quando alguém sai                                     |
| Limite              | quantos membros e quantas reservas o grupo aceita. Não confundir com as vagas do jogo                                           |
| Convite para membro | pedido do dono, feito dentro do app, para uma reserva virar membro (GRP-40)                                                     |

## 2. Regras de negócio

Cada regra tem um id fixo (`GRP-NN`). O id não é reaproveitado: se uma regra sair, ela fica riscada com a data. Testes e código citam o id.

### Participação

- **GRP-01. Quem cria é dono e membro.** O grupo nasce com o criador como membro, com o cargo Dono (GRP-48). O dono não pode ser removido.
- **GRP-02. Entrar pelo link define o papel.** O link de membro faz a pessoa entrar como membro, e o de reserva, como reserva.
  - Se uma reserva aceita o link de membro, ela **vira membro**.
  - Se um membro aceita o link de reserva, **nada muda**.
  - Entrar de novo também não muda nada.
  - Com os membros no limite, o link de membro responde `GROUP_MEMBERS_FULL`, e uma reserva que o abre continua reserva. Com as reservas no limite, o link de reserva responde `GROUP_RESERVES_FULL` (vale a GRP-39).
  - _Por quê:_ ninguém é rebaixado por engano ao clicar no link errado. _(Alterada em 2026-11-10: antes, os links não tinham limite.)_
- **GRP-03. A data de entrada nunca muda,** nem quando a reserva vira membro. _(Alterada em 2026-11-15: antes, a promoção ficava registrada à parte, em `roleChangedAt`.)_
  - _Por quê:_ ninguém lia a data da promoção. A participação é o estado de agora; o histórico de "entrou, saiu, subiu" fica para os eventos ([ADR 0015](../decisions/0015-modelo-do-grupo-e-do-jogo.md)).
- **GRP-04. Quem não participa não sabe que o grupo existe.** Qualquer rota do grupo responde `GROUP_NOT_FOUND` (404) para quem não é membro nem reserva.
  - Quem participa e tenta uma ação sem ter a permissão dela recebe `GROUP_PERMISSION_DENIED` (403 com corpo, `details.permission`). Numa ação só do dono (GRP-49), recebe `GROUP_NOT_OWNER` (403 com corpo).
  - _Por quê:_ não vaza a existência do grupo, e o 403 com corpo não dispara a renovação de sessão do web.
  - _Alterada em 2026-11-13:_ antes, toda ação restrita era só do dono.
- **GRP-05. A reserva vê o que o membro vê** (grupo, jogo, lista, membros). Os três links só vão na resposta para quem tem `members.manage` (GRP-49). _(Alterada em 2026-11-13: antes, só para o dono.)_
- **GRP-06. Ordem da lista de membros:** primeiro o dono, depois os membros e por último as reservas. Dentro de cada papel, ordena pela data de entrada, da mais antiga para a mais nova.

### Links

- **GRP-07. São três links, um por papel:** membro e reserva (`/join/<token>`) e jogo, para convidados (`/play/<token>`).
  - Gerar outro link **invalida o anterior na hora**. O link antigo responde `GROUP_INVITE_INVALID` ou `GAME_LINK_INVALID`.
  - _Por quê:_ é assim que o dono bloqueia alguém sem precisar de lista de bloqueio. O token não é segredo de login, então o dono pode rever o link atual quando quiser.
- **GRP-08. O link do jogo só funciona com os convidados ligados.** Com eles desligados, abrir, confirmar ou gerar o link responde `GAME_LINK_INVALID`.
- **GRP-09. O link do jogo leva sempre ao jogo atual.** Qualquer pessoa logada vê o nome do grupo, o horário, o lugar com a rota (GRP-63), a lista com nomes e os times publicados ([TIM-09](times.md)), e pode confirmar quando a camada dos convidados abre. _(Alterada em 2026-11-11: entraram os times publicados. Alterada em 2026-11-15: o local em texto virou o lugar.)_
  - O convidado não vira membro e não vê os membros nem os links.
  - Um membro ou reserva que abre o link é tratado pelo seu papel no grupo.
  - _Por quê:_ o dono manda um link só no WhatsApp toda semana, sem encher a lista de membros.

### Jogo

- **GRP-10. O jogo é calculado, não agendado.** Ele sai de `weekday` + `time` no fuso do grupo.
  - O **jogo atual** é a primeira ocorrência com `início + 3 h > agora`.
  - O jogo só vira item no banco na primeira confirmação ou no cancelamento. Antes disso a api devolve o jogo "virtual", com a lista vazia.
  - _Por quê:_ não precisa de cron nem de recurso de infra, e jogo sem ninguém não gera item.
- **GRP-11. Não há histórico.** Só o jogo atual existe. Uma rota com outra data responde `GAME_NOT_FOUND`.
- **GRP-12. Estados do jogo:**
  - `scheduled`: antes de a lista dos membros abrir;
  - `open`: até o início;
  - `in_progress`: do início até 3 h depois. A lista fica visível, mas ninguém confirma, desiste ou cancela;
  - depois disso, o jogo atual passa a ser o da semana seguinte;
  - `cancelled`: vale até o fim da mesma janela.
  - _Por quê do máximo de 144 h:_ a lista do jogo seguinte abre no mínimo 24 h depois do início do atual, então nunca há dois jogos atuais.
- **GRP-58. O grupo joga um esporte só, do catálogo** ([esportes.md](esportes.md)), escolhido ao criar. Quem joga outro esporte cria outro grupo.
  - Um esporte que não está no catálogo, ou que está desativado, responde `SPORT_NOT_FOUND` (422, `details.sportId`).
  - O esporte não muda depois de criado. Um esporte desativado depois (ESP-05) continua valendo para o grupo.
  - Todos os jogos do grupo são desse esporte, e os times usam as posições dele ([times.md](times.md)).
  - _Por quê:_ cada esporte tem as suas posições, regras de times e, depois, limites e pontuação. Um esporte por grupo mantém tudo isso simples, e grupos diferentes resolvem quem joga mais de um. Mudar o esporte deixaria as posições e as regras de times apontando para posições que não existem.
- **GRP-13. Fuso do grupo:** é o que vem no pedido. Se não vier, é o das preferências do dono (USR-07 em [usuarios.md](usuarios.md)), e se ele não tiver, `America/Sao_Paulo`.
  - A api devolve os instantes em UTC, e o web mostra no fuso de quem lê ([ADR 0006](../decisions/0006-datas-utc-fuso-do-perfil.md)).
  - O fuso do grupo só aparece na tela quando é diferente do fuso de quem lê.

### Camadas da lista

- **GRP-14. São três camadas, em horas antes do início:**
  - membros: de 1 a 144;
  - reservas: de 0 a 144;
  - convidados: de 0 a 144, ou desligado.
  - Elas precisam respeitar a ordem **membros ≥ reservas ≥ convidados**. Fora de ordem, a resposta é `GROUP_LAYERS_INVALID` (422, `details.field`).
  - _Por quê:_ a única prioridade dos membros é poder confirmar mais cedo (ver GRP-17).
- **GRP-15. Valores padrão, decididos pela api:**
  - Na criação, sem nenhuma camada no pedido: **membros 48h**, **reservas 24h** e **convidados desligados**.
  - Na criação, sem os membros e com outras camadas: membros 48h e as camadas que vieram (reservas acima de 48h respondem `GROUP_LAYERS_INVALID`, pela GRP-14).
  - Na criação, com os membros e sem as reservas: reservas na metade das horas dos membros (arredondando para baixo).
  - ~~Grupo antigo sem o campo das reservas: elas abrem junto com os membros.~~ _(Removida em 2026-11-15: sem dados em produção, todo grupo grava as reservas, ADR 0015.)_
  - _Por quê:_ quem cria o grupo não precisa decidir as camadas na hora (ver GRP-34), e o padrão é uma regra de negócio, então fica na api. O web não conhece esses números: ele só mostra o que a api gravou.
- **GRP-16. Só quem tem `settings.edit` muda as camadas, os limites, as vagas e o mínimo** (GRP-49). O `PATCH /groups/{id}` só aceita as três camadas (e `null` desliga os convidados), os dois limites (GRP-38), as vagas (GRP-45), o mínimo (GRP-46, `null` desliga) e o lugar padrão (GRP-62, `null` tira). Nome e horário ainda não podem ser mudados. _(Alterada em 2026-11-10: antes, só as camadas. Alterada em 2026-11-11: entraram as vagas e o mínimo. Alterada em 2026-11-13: antes, só o dono. Alterada em 2026-11-15: entrou o lugar padrão.)_
- **GRP-17. Cada um confirma a partir da sua camada.** Quem tenta confirmar antes recebe `GAME_LIST_NOT_OPEN`, com `details.opensAt` (o horário da camada de quem pede).
  - O `status` do jogo é sempre o da camada dos membros.
  - O `myOpensAt` diz quando quem pede pode confirmar.

### Lista e fila

- **GRP-18. A ordem é de chegada, sem furar fila.** Quem confirma primeiro fica com a vaga, seja membro, reserva ou convidado. Um membro que confirma com a lista cheia vai para a fila.
  - _Por quê:_ é previsível ("confirmei, estou dentro"), e ninguém é tirado da lista depois.
- **GRP-19. A fila é implícita.** Quem está numa posição menor que o número de vagas está dentro, e o resto está na fila. Não existe campo de status.
  - Quando alguém de dentro sai, o primeiro da fila sobe sozinho.
- **GRP-20. Confirmar de novo mantém a posição.** Quem desiste e confirma de novo vai para o fim. O dono só está na lista se confirmar.
- **GRP-21. Confirmar e desistir só valem com a sua camada aberta e antes do início.**
  - Com o jogo em andamento, a resposta é `GAME_CLOSED`.
  - Com o jogo cancelado, é `GAME_CANCELLED`.
  - Desistir sem estar na lista não faz nada.
- **GRP-22. Aviso de promoção.** Quando alguém de dentro sai (porque desistiu ou foi removido), quem passou a ocupar a última vaga vindo da fila recebe a notificação `waitlist_promoted`. Quando as vagas aumentam (GRP-45), cada pessoa que subiu da fila recebe o mesmo aviso.
  - O convidado recebe o link do jogo, e o membro ou a reserva, o link do grupo.
  - _Alterada em 2026-11-11:_ entrou o aviso quando as vagas aumentam.
- **GRP-23. O papel mostrado na lista é o papel atual,** calculado na leitura. Se uma reserva virar membro, a lista já mostra o novo papel.

### Vagas e mínimo

- **GRP-45. As vagas têm um padrão do grupo e podem mudar em cada jogo.**
  - As **vagas** são quantos ficam dentro da lista (GRP-19), de 2 a 50. Com as vagas cheias, quem confirma vai para o Banco, como sempre (GRP-18).
  - O padrão vem da criação do grupo, e quem tem `settings.edit` muda nos Ajustes. Quem tem `game.manage` muda as vagas **só do jogo atual** (`PATCH /groups/{id}/games/{date}`), e o padrão do grupo não muda. _(Alterada em 2026-11-13: antes, só o dono.)_ Sem valor próprio, o jogo usa o padrão, inclusive se ele mudar depois.
  - **Aumentar** as vagas faz quem está no Banco subir na ordem da fila, com o aviso de promoção (GRP-22).
  - **Diminuir** não pode deixar menos vagas do que quem já está dentro: a resposta é `GAME_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed` = quantos estão dentro). Vale também para o padrão do grupo, quando o jogo atual não tem valor próprio.
  - O jogo pode voltar a usar o padrão do grupo ("Usar o padrão do grupo"), com as mesmas regras de aumentar e diminuir.
  - Mudar o jogo segue o prazo de confirmar (GRP-21): em andamento, `GAME_CLOSED`; cancelado, `GAME_CANCELLED`. Outra data, `GAME_NOT_FOUND` (GRP-11).
  - _Por quê:_ tem semana em que o grupo chama 14 em vez de 12. Não diminuir abaixo de quem está dentro mantém a GRP-18: quem confirmou dentro não é tirado da lista depois.
- **GRP-46. O mínimo para o jogo acontecer é opcional,** de 2 até as vagas. Também tem o padrão do grupo (nos Ajustes, desligado em grupo novo e nos antigos) e um valor só do jogo atual, como as vagas (GRP-45).
  - Com o mínimo, o jogo está **confirmado** quando o número de quem está dentro chega ao mínimo. Se alguém desiste e o número cai, ele volta a não estar confirmado.
  - Mínimo acima das vagas responde `GROUP_MIN_PLAYERS_INVALID` (422, `details.max` = as vagas). Isso vale ao mudar qualquer um dos dois.
  - O jogo não é cancelado sozinho por não chegar ao mínimo: quem decide cancelar é quem tem `game.manage` (GRP-24).
  - _Por quê:_ com 10 de 12 já dá jogo. A lista precisa saber se o jogo vai acontecer, sem esperar fechar as 12. Cancelar sozinho precisaria de um horário de corte e de um agendador, que o jogo calculado não tem (GRP-10).
- **GRP-47. Aviso de jogo confirmado:** na **primeira** vez que o jogo atinge o mínimo (por uma confirmação, por mais vagas ou por um mínimo menor), o aviso `game_confirmed` vai para todos da lista (dentro e fila), menos quem fez a mudança (quem confirmou, ou quem mudou as vagas ou o mínimo). Se o número cair e voltar ao mínimo, não avisa de novo. _(Alterada em 2026-11-13: antes, menos o dono.)_
  - O link é o grupo; para o convidado, o link do jogo (como o GRP-22).
  - _Por quê:_ é a notícia que todos esperam ("vai ter jogo"). Repetir a cada sobe e desce seria barulho.

### Cancelar e remover

- **GRP-24. Só quem tem `game.manage` cancela o jogo atual, e só antes do início.** O aviso `game_cancelled` vai para todos da lista (dentro e fila), menos quem cancelou. _(Alterada em 2026-11-13: antes, só o dono, e o aviso ia para todos menos o dono.)_
  - Cancelar de novo devolve o jogo como está, sem avisar outra vez.
  - Quem confirma no mesmo instante do cancelamento **ou** recebe `GAME_CANCELLED` sem ser gravado, **ou** entra na lista e recebe o aviso. Nunca fica confirmado num jogo cancelado sem ser avisado.
  - _Por quê:_ a confirmação confere o jogo dentro da própria gravação, e não só antes dela. Assim, uma das duas operações sempre vem antes da outra.
- **GRP-44. Só quem tem `game.manage` reabre o jogo cancelado, e só antes do início** (`POST /groups/{id}/games/{date}/reopen`). _(Alterada em 2026-11-13: antes, só o dono.)_
  - a lista volta como estava: quem estava dentro continua dentro, e a fila, na mesma ordem;
  - o aviso `game_reopened` vai para todos da lista (dentro e fila), menos quem reabriu;
  - reabrir um jogo que não está cancelado devolve o jogo como está, sem avisar ninguém;
  - com o jogo já no horário de início, a resposta é `GAME_CLOSED`, e com o grupo arquivado, `GROUP_ARCHIVED` (GRP-32). Um arquivamento no mesmo instante é barrado dentro da gravação: ou o jogo reabre antes e o arquivamento cancela de novo (GRP-31), ou a reabertura recebe `GROUP_ARCHIVED`;
  - cancelar de novo depois de reabrir avisa outra vez (GRP-24), com a data do novo cancelamento.
  - _Por quê:_ o dono cancela por engano, ou o motivo do cancelamento some (por exemplo, desarquivou o grupo, GRP-33). Manter a lista não tira a vaga de ninguém, e o aviso conta para quem já tinha feito outros planos.
- **GRP-25. Quem tem `members.manage` remove um membro ou uma reserva.** O dono nunca é removido, nem por ele mesmo (`GROUP_OWNER_NOT_REMOVABLE`), e quem é Admin só o dono remove (GRP-53). Quem não é dono e remove a si mesmo recebe `VALIDATION_ERROR`: para isso existe sair do grupo (GRP-42). _(Alterada em 2026-11-13: antes, só o dono removia.)_ Numa operação só, a pessoa:
  - perde o acesso;
  - tem o link do seu papel trocado;
  - perde a vaga, se o jogo está `scheduled`, `open` ou `cancelled` e ela estava na lista. Com o jogo em andamento, a vaga fica. Com o jogo cancelado, ninguém é avisado de promoção (GRP-22); _(alterada em 2026-11-10: antes, com o jogo cancelado a vaga ficava, e voltaria com a reabertura, GRP-44)_
  - perde o convite para membro pendente, se tinha (GRP-40);
  - perde o cargo (GRP-48);
  - libera um lugar no limite do seu papel (GRP-39).
  - Depois vale a GRP-22. O removido não é notificado.
  - _Por quê:_ ela perde o acesso e a vaga de uma vez, e a troca do link impede que volte pelo link antigo.
- **GRP-26. Remoção ao mesmo tempo que outra mudança:** se a pessoa saiu antes, a resposta é `GROUP_MEMBER_NOT_FOUND`.
  - Se o papel ou o link mudaram no meio, a operação relê e tenta de novo, até 3 vezes.

### Limites, convite para membro e sair

- **GRP-38. O grupo tem um limite de membros e um de reservas.** Quem tem `settings.edit` muda os dois, nos Ajustes (GRP-16).
  - Membros: de 2 a 30, contando o dono. Reservas: de 0 a 30. Com 0, o grupo não aceita reservas.
  - Grupo novo nasce com **30 membros e 30 reservas**. Quem decide o padrão é a api, como nas camadas (GRP-15), e o form de criar não pede os limites (GRP-34).
  - Abaixar um limite para menos do que o grupo já tem **não tira ninguém**. Só impede novas entradas naquele papel até sobrar lugar.
  - _Por quê:_ o dono controla o tamanho do grupo (ex.: 14 membros fixos), e o teto de 30 mantém a lista de membros e os avisos pequenos para o sistema.
- **GRP-39. O limite vale para toda entrada num papel:** pelo link (GRP-02) e pelo convite para membro (GRP-41). Duas entradas ao mesmo tempo nunca passam do limite: a segunda recebe `GROUP_MEMBERS_FULL` ou `GROUP_RESERVES_FULL`.
  - Uma reserva que vira membro ocupa um lugar de membro e libera um de reserva.
  - Remover (GRP-25) e sair (GRP-42) liberam o lugar na hora.
  - _Por quê:_ o limite é conferido dentro da própria gravação, e não só antes dela (como na GRP-24).
- **GRP-40. Quem tem `members.manage` convida uma reserva para virar membro, dentro do app.** Na lista de membros, a pessoa escolhe a reserva, e ela recebe o aviso `member_invite`, com o link do grupo. _(Alterada em 2026-11-13: antes, só o dono.)_
  - Só com lugar de membro livre. Com os membros no limite, convidar responde `GROUP_MEMBERS_FULL`.
  - Cada reserva tem no máximo um convite pendente. Convidar de novo devolve o pendente, sem avisar outra vez.
  - O convite vence em **7 dias**. Vencido, conta como inexistente, e dá para convidar de novo.
  - Quem tem `members.manage` pode cancelar o convite pendente, inclusive o que outra pessoa mandou. Cancelar um que não existe não faz nada.
  - Convidar quem não é reserva responde `GROUP_MEMBER_NOT_FOUND`.
  - Ninguém convida a si mesmo: a resposta é `VALIDATION_ERROR`, e a tela não oferece o convite na linha da própria pessoa. _(Nova em 2026-11-13.)_ _Por quê:_ o cargo não muda a participação (GRP-48). Sem isso, a reserva com `members.manage` subiria sozinha para membro com um toque.
  - **O convite não segura o lugar.** Quem entrar primeiro (pelo convite ou pelo link de membro) fica com ele.
  - _Por quê:_ o dono escolhe quem sobe sem espalhar o link de membro, que serve para qualquer pessoa. Segurar o lugar exigiria liberá-lo quando o convite vence, sem que ninguém precise fazer nada.
- **GRP-41. A reserva aceita ou recusa o convite** na página do grupo.
  - Aceitar faz dela membro, sem mudar a data de entrada (GRP-03), e só se ainda houver lugar. Sem lugar, a resposta é `GROUP_MEMBERS_FULL`, ela continua reserva e o convite continua valendo até vencer.
  - Recusar apaga o convite. O dono não é avisado: ele vê na lista que o convite sumiu.
  - Aceitar ou recusar sem convite pendente (vencido, cancelado ou já usado) responde `GROUP_MEMBER_INVITE_INVALID`.
  - Se a reserva vira membro pelo link de membro, o convite pendente é apagado.
- **GRP-42. Membros e reservas podem sair do grupo sozinhos.** O dono não pode (`GROUP_OWNER_NOT_REMOVABLE`): para sair, ele passa o grupo para outro membro antes (GRP-54). Numa operação só, quem sai:
  - perde o acesso;
  - perde a vaga no jogo, se ele está `scheduled`, `open` ou `cancelled` e ela estava na lista (como na GRP-25). Com o jogo em andamento, a vaga fica;
  - perde o convite para membro pendente, se tinha;
  - perde o cargo (GRP-48). Se voltar pelo link, volta com o cargo Membro;
  - libera um lugar no limite do seu papel.
  - Depois vale a GRP-22. **O link do papel não muda,** e ninguém é avisado.
  - Se a pessoa já tinha saído (ou foi removida no meio), a resposta é `GROUP_MEMBER_NOT_FOUND`. Se o papel mudou no meio, a operação relê e tenta de novo, como na GRP-26.
  - _Por quê:_ é o caminho mais comum para abrir um lugar de membro. O link não muda porque quem sai não está sendo bloqueado: pode voltar pelo link, se houver lugar.

### Arquivar

- **GRP-31. Só o dono arquiva o grupo.** Ao arquivar:
  - o grupo sai de "meus grupos" e passa a aparecer só na lista de arquivados;
  - os três links param de funcionar na hora (`GROUP_INVITE_INVALID` ou `GAME_LINK_INVALID`);
  - o jogo atual é cancelado, com o aviso da GRP-24, se estiver `scheduled` ou `open`. Um jogo `in_progress` fica como está. Um jogo ainda virtual (ninguém confirmou, GRP-10) não vira item: não há quem avisar;
  - membros e reservas continuam no grupo, com os mesmos papéis e datas.
  - Arquivar de novo não muda a data de arquivamento, mas cancela o jogo que tenha ficado sem cancelar.
  - _Por quê:_ apagar um grupo envolve milhares de itens, o que não cabe numa operação só, e apagaria o histórico de que a E4 e a E6 dependem. Arquivar custa o mesmo para qualquer tamanho de grupo e pode ser desfeito.
- **GRP-32. Grupo arquivado é só leitura.** Membros e reservas ainda leem o grupo (com `archivedAt`) e a lista de membros.
  - Pedir o jogo atual, confirmar, desistir, mudar as camadas ou os limites, trocar um link, remover alguém, cancelar o jogo, convidar para membro, aceitar ou recusar o convite, sair do grupo e cadastrar, editar, arquivar ou desarquivar um lugar responde `GROUP_ARCHIVED` (409). A lista dos lugares continua de leitura. _(Alterada em 2026-11-10: entraram os limites, o convite para membro e sair do grupo. Alterada em 2026-11-15: entraram os lugares.)_
  - Quem confirma no mesmo instante do arquivamento recebe `GROUP_ARCHIVED` e não é gravado (como na GRP-24).
  - _Por quê do jogo atual:_ sem histórico (GRP-11), um grupo arquivado não tem jogo para mostrar.
- **GRP-33. Só o dono desarquiva.** O grupo volta para "meus grupos" de todos, com **três links novos**. Os links antigos não voltam a valer. Desarquivar um grupo ativo não muda nada.

### Logo e capa

- **GRP-35. Só quem tem `settings.edit` troca e remove o logo e a capa do grupo.** São as mídias de finalidade `group.logo` (512×512) e `group.cover` (1600×600), as duas até 2 MB e públicas (MID-02 em [midia.md](midia.md)). O envio, a conferência, a troca e a remoção seguem as regras da mídia.
  - Quem não tem a permissão recebe `GROUP_PERMISSION_DENIED`, tanto ao pedir o envio quanto ao confirmar (MID-01). Quem perdeu o cargo no meio do envio é barrado ao confirmar.
  - Com o grupo arquivado, pedir o envio, trocar ou remover responde `GROUP_ARCHIVED` (vale a GRP-32).
  - _Por quê:_ o logo e a capa identificam o grupo para todos, então quem decide é quem cuida dos ajustes do grupo.
  - _Alterada em 2026-11-13:_ antes, só o dono.

### Cargos e permissões

- **GRP-48. Papel e cargo são coisas diferentes.** O papel (membro ou reserva) diz como a pessoa **participa**: a camada em que confirma (GRP-17), o limite em que conta (GRP-38) e o link por onde entra (GRP-02). O cargo diz o que ela **administra** (GRP-49).
  - Membros e reservas podem ter cargo. O convidado não, porque não participa do grupo (GRP-09).
  - Cada pessoa tem **exatamente um cargo** (GRP-50): Dono (o dono, GRP-01), Admin ou Membro, o padrão, sem permissões. Quem entra no grupo, por qualquer caminho, entra com o cargo Membro. _(Alterada em 2026-11-15: antes, o dono não tinha cargo e quem não era admin ficava "sem cargo".)_
  - Virar membro (GRP-02, 41) não muda o cargo. Sair (GRP-42) e ser removido (GRP-25) tiram o cargo: quem volta pelo link volta com o cargo Membro.
  - _Por quê do dono como cargo:_ o dono fica num lugar só, na participação dele, e não copiado no grupo. Passar o grupo (GRP-54) é trocar o cargo de duas participações, sem mexer no grupo.
  - _Por quê:_ ajudar a organizar não tem relação com a prioridade na lista. A reserva que monta os times continua confirmando depois dos membros, e dar um cargo não ocupa lugar de membro. Um cargo só por pessoa deixa claro o que cada um pode, sem somar listas.
- **GRP-49. As permissões são um catálogo fixo,** por assunto:

  | Permissão        | O que libera                                                                                                                                                                              |
  | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `game.manage`    | as vagas e o mínimo só do jogo atual (GRP-45, 46), cancelar (GRP-24) e reabrir o jogo (GRP-44)                                                                                            |
  | `teams.manage`   | as posições (TIM-03, 04), os times do jogo, o sorteio e os avulsos (TIM-07, 15, 16, 24) e a configuração de times do grupo (TIM-17)                                                       |
  | `members.manage` | ver e gerar os links (GRP-05, 07), remover alguém (GRP-25) e o convite para membro (GRP-40)                                                                                               |
  | `settings.edit`  | as camadas, os limites, as vagas e o mínimo padrão (GRP-16, 38, 45, 46) e o logo e a capa (GRP-35)                                                                                        |
  | `seasons.manage` | o regulamento da competição ([CMP-07](competicao.md)) e as temporadas (abrir, programar e encerrar, CMP-30, 32). Só vale com a competição ativa no grupo (CMP-04)                         |
  | `results.record` | fechar os jogos na competição: a chamada, o resultado do dia e o amistoso ([CMP-11](competicao.md)), e corrigir os já fechados (CMP-15). Só vale com a competição ativa no grupo (CMP-04) |
  - **Só do dono, sempre:** arquivar e desarquivar (GRP-31, 33), dar e tirar cargo (GRP-51), remover quem é Admin (GRP-53), passar o grupo (GRP-54) e começar o teste da competição ([CMP-02](competicao.md)). Nenhum cargo libera isso. Quem não é dono recebe `GROUP_NOT_OWNER`.
  - _(Alterada em 2026-11-14: entraram `seasons.manage` e `results.record`, com a competição.)_
  - O cargo Dono tem todas as permissões, e o Membro não tem nenhuma.
  - _Por quê:_ por assunto, o dono entende o cargo de uma vez ("cuida dos times"), sem uma caixinha por botão. O que fica só com o dono é o que muda quem manda no grupo: se um cargo pudesse dar cargos, alguém daria a si mesmo o que não tem.

- **GRP-50. Os cargos, por enquanto, são três e fixos:** Dono (`owner`), Admin (`admin`, com todas as permissões do catálogo, GRP-49) e Membro (`member`, sem nenhuma). Ninguém muda o nome nem as permissões deles. Criar outros cargos fica para depois (seção 5). _(Alterada em 2026-11-15: antes, o Admin era o único cargo.)_
  - O nome de cada cargo na tela vem do idioma de quem vê (Dono, Admin, Membro), pelo id.
- **GRP-51. Só o dono dá e tira o cargo Admin** de um membro ou reserva (`PUT`/`DELETE /groups/{id}/members/{userId}/staff-role`). Tirar o Admin devolve o cargo Membro. _(Alterada em 2026-11-15: antes, tirar deixava a pessoa sem cargo.)_
  - Dar o cargo que a pessoa já tem, ou tirar de quem não tem, não muda nada.
  - Para quem não participa do grupo, a resposta é `GROUP_MEMBER_NOT_FOUND`. Para o próprio dono, `VALIDATION_ERROR` (o cargo Dono só muda ao passar o grupo, GRP-54).
  - Quem recebe um cargo recebe o aviso `staff_role_granted`, com o link do grupo. Quem perde não é avisado, como na remoção (GRP-25).
  - Com o grupo arquivado, a resposta é `GROUP_ARCHIVED` (GRP-32).
- **GRP-52. A permissão é conferida a cada ação, na api.** Quem perde o cargo com a tela aberta é barrado na próxima ação (`GROUP_PERMISSION_DENIED`), e a tela se ajusta (GRP-57). _(Alterada em 2026-11-13: antes, a tela só mudava ao recarregar.)_
  - Um cargo que não existe mais conta como o cargo Membro.
  - A ordem dos erros é sempre: quem não participa recebe `GROUP_NOT_FOUND` (GRP-04), depois vem a permissão (`GROUP_PERMISSION_DENIED` ou `GROUP_NOT_OWNER`) e só então o grupo arquivado (`GROUP_ARCHIVED`, GRP-32).
  - _Por quê:_ a tela só esconde o que a pessoa não pode fazer (GRP-55). Quem decide é sempre a api.
- **GRP-53. Quem é Admin só o dono remove.** Com `members.manage`, remover quem tem um cargo além de Membro responde `GROUP_NOT_OWNER`. Mudar as posições (TIM-04) e o convite para membro (GRP-40) de quem é Admin seguem as regras normais. _(Texto ajustado em 2026-11-15: todos têm cargo, GRP-48.)_
  - _Por quê:_ um admin não tira outro admin do grupo. Quem responde pelo grupo decide quem ajuda a organizar.
- **GRP-54. O dono passa o grupo para um membro** (`POST /groups/{id}/transfer` `{ userId }`). Numa operação só:
  - a pessoa recebe o cargo Dono, no lugar do que tinha (GRP-48);
  - o dono antigo continua membro, agora com o cargo **Admin** (GRP-50). O novo dono pode tirar o cargo depois;
  - duas transferências ao mesmo tempo nunca deixam dois donos: a operação só grava se o dono antigo ainda for o dono, e a segunda recebe `GROUP_NOT_OWNER`. _(Nova em 2026-11-15.)_
  - os links, o jogo, a lista e os times não mudam;
  - o novo dono recebe o aviso `group_transferred`, com o link do grupo.
  - Só para um **membro** (a reserva não, porque o dono é membro, GRP-01). Para uma reserva, para quem não participa ou para quem saiu no meio, a resposta é `GROUP_MEMBER_NOT_FOUND`. Para o próprio dono, `VALIDATION_ERROR`.
  - Com o grupo arquivado, a resposta é `GROUP_ARCHIVED` (GRP-32).
  - _Por quê:_ é o único jeito de o dono sair do grupo (GRP-42) sem largar o grupo sem ninguém. Ficar como Admin evita que quem organizava perca tudo de uma vez por engano.
- **GRP-55. A api diz o que cada pessoa pode fazer:** o grupo (`GET /groups/{id}` e cada item de `GET /me/groups`) vem com o papel (`myTier`), o cargo (`myRoleId`) e as permissões (`myPermissions`) de quem pede (GRP-49), e a lista de membros traz o papel (`tier`) e o cargo (`roleId`) de cada pessoa. O grupo não diz mais quem é o dono (`ownerId`): isso está no cargo de cada pessoa. _(Alterada em 2026-11-15: antes, `myRole`, `ownerId`, `isOwner` e `staffRole`.)_
  - _Por quê:_ o web não calcula permissão. Ele só mostra ou esconde pelo que a api devolveu, e as regras de quem pode o quê ficam num lugar só.
- **GRP-36. Todos que veem o grupo veem o logo e a capa:** membros, reservas e convidados pelo link do jogo (`logoUrl` e `coverUrl` no grupo).

### Lugares

- **GRP-60. O grupo tem lugares salvos.** Quem tem `settings.edit` cadastra e edita (`POST /groups/{id}/places`, `PUT /groups/{id}/places/{placeId}`). Cada lugar tem:
  - **nome**: de 1 a 60 caracteres (ex.: "Quadra do clube");
  - **endereço**: rua (até 120), número (até 20, opcional), bairro (até 60, opcional), cidade (até 60), estado (até 60), país (código de 2 letras, padrão `BR`) e CEP (até 12, opcional);
  - **o ponto no mapa**: `lat` (de −90 a 90) e `lng` (de −180 a 180), obrigatórios.
  - Na tela, o ponto vem de um **link do Google Maps colado** (o completo, com as coordenadas) ou do botão **"Usar minha localização"** (GPS do aparelho). Link sem coordenadas (o curto, `maps.app.goo.gl`) é recusado na tela, com a dica de abrir o link e copiar o endereço completo.
  - O grupo tem no máximo **10 lugares ativos**. O 11º responde `PLACE_LIMIT_REACHED` (409, `details.max`), também quando dois são cadastrados ao mesmo tempo.
  - Editar manda a versão do lugar (como a GRP-59). Lugar que não é do grupo responde `PLACE_NOT_FOUND` (404).
  - _Por quê:_ o grupo costuma alternar entre poucas quadras. Salvar uma vez evita digitar o endereço a cada jogo, e o ponto no mapa leva todo mundo ao lugar certo. O autocompletar de endereço (Google Places) fica para depois, por custo ([ADR 0015](../decisions/0015-modelo-do-grupo-e-do-jogo.md)).
- **GRP-61. Lugar não é apagado, só arquivado** (`POST .../places/{placeId}/archive` e `/unarchive`, com a versão).
  - O arquivado some da escolha e não conta no limite, mas continua aparecendo onde já foi usado.
  - O lugar padrão (GRP-62) não pode ser arquivado: a resposta é `PLACE_IS_DEFAULT` (409). Primeiro troque ou tire o padrão.
  - Desarquivar volta o lugar para a escolha, se houver espaço no limite (senão, `PLACE_LIMIT_REACHED`).
  - _Por quê:_ quando os jogos passarem a guardar o próprio lugar (ADR 0015), apagar um lugar deixaria o jogo antigo sem local.
- **GRP-62. O lugar padrão do grupo vale para o jogo.** Quem tem `settings.edit` escolhe o padrão nos Ajustes (`defaultPlaceId` no `PATCH /groups/{id}`, GRP-16; `null` tira). Ele é o local do jogo atual e dos próximos, até os horários terem o seu lugar (tarefa dos horários, ADR 0015). Sem padrão, o jogo não tem local.
  - Só um lugar ativo do grupo pode ser o padrão. Outro responde `PLACE_NOT_FOUND`.
  - O grupo nasce sem lugar: o form de criar não pede (GRP-34), e o lugar é cadastrado depois, nos Ajustes.
  - _Alterada a GRP-34 e a GRP-09 junto:_ sai o local em texto livre (`location`), que o form nunca pedia. O [plano 012](../plans/012-remover-local-do-grupo.md) deixa de valer.
- **GRP-63. Quem vê o jogo vê o lugar e a rota:** membros, reservas e convidados pelo link do jogo (GRP-09) veem o nome, o endereço e o botão **"Ver rota"**. Ele abre o mapa com o caminho até o ponto do lugar (`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`), sem custo para o app.
  - A lista dos lugares (`GET /groups/{id}/places`, os arquivados também, marcados) é de membros e reservas. O convidado só vê o lugar do jogo.
  - _Por quê:_ "onde é?" é a pergunta que mais aparece no grupo antes do jogo, e o link leva direto, do celular, ao app de mapa que a pessoa usa.

### Edição ao mesmo tempo

- **GRP-59. Mudar os Ajustes manda a versão que a tela mostrou.** O grupo vem com duas versões: `version`, a da identidade (nome, esporte, logo e capa), e `settingsVersion`, a dos Ajustes (camadas, limites, vagas e mínimo). O `PATCH /groups/{id}` exige `version` igual à `settingsVersion` atual. Se outra pessoa mudou os Ajustes antes, a resposta é `VERSION_CONFLICT` (409, `details.currentVersion`) e nada é gravado. A tela relê o que estava editando, fecha o painel e avisa: "Alguém mudou isto antes de você. Atualizamos; faça a mudança de novo." _(Nova em 2026-11-15.)_
  - Entrar, sair, confirmar e as outras ações não mandam versão: quem garante o limite é o contador (GRP-39). Trocar link, arquivar, cargos e o logo também não: cada um já confere o que muda dentro da gravação.
  - Mudar o logo ou a capa não muda a `settingsVersion`, e mudar os Ajustes não muda a `version`: um não conflita com o outro.
  - _Por quê:_ com cargos, duas pessoas podem editar a mesma coisa ao mesmo tempo. Sem a versão, a segunda gravação apagaria a primeira sem ninguém perceber ([ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)).

### Telas (web)

- **GRP-27. A tela `/groups` tem três abas, e uma quarta quando há grupo arquivado** (na query `?tab=`):
  - **Próximos jogos**: todos os grupos ativos, do jogo mais próximo para o mais distante, com os cancelados no fim;
  - **Meus grupos**: os grupos ativos de que a pessoa é dona (o cargo Dono, GRP-55);
  - **Participo**: os demais grupos ativos;
  - **Arquivados**: só aparece se a pessoa participa de algum grupo arquivado (GRP-31). Do arquivado mais recente para o mais antigo, com a contagem na aba ("Arquivados · 2"). `?tab=archived` sem nenhum arquivado cai em Próximos jogos.
  - A tela vazia, com o botão "Criar grupo", só aparece quando não há grupo nenhum, nem arquivado.
  - _Por quê:_ quem arquivou precisa de um caminho de volta para desarquivar (GRP-33), sem misturar grupos parados com as listas do dia a dia. _(Alterada em 2026-11-10: antes, eram só as três abas.)_
- **GRP-28. A frase do card segue esta prioridade:**
  0. arquivado: "Arquivado em {data}", sem placar (o grupo arquivado não tem jogo, GRP-32);
  1. cancelado;
  2. em andamento;
  3. "você joga · Nº";
  4. "na fila · Nº";
  5. "abre {data}" (a camada de quem lê ainda não abriu);
  6. vagas que faltam, ou lotado. Com o mínimo (GRP-46), "faltam N para fechar" até chegar nele, e "jogo confirmado" depois. _(Alterada em 2026-11-11.)_
- **GRP-29. A página do grupo tem quatro abas, e uma quinta com a competição, cada uma com um assunto só:** Jogo, Times, Membros, **Competição** (só quando a competição do grupo não está desativada, [CMP-09](competicao.md)) e Ajustes (este, só para quem tem `settings.edit`, `teams.manage`, `game.manage` ou `seasons.manage`, ou é o dono). _(Alterada em 2026-11-14: entrou a aba Competição.)_ O nome da aba não leva contagem: as contagens ficam nas seções de dentro.
  - Cada ação de administração aparece só para quem tem a permissão dela (GRP-49, 56). Abaixo, "o dono" quer dizer quem tem a permissão daquela ação, e "só o dono" é o que GRP-49 deixa só para ele. _(Alterada em 2026-11-13: antes, todas as ações eram do dono.)_
  - **Jogo** ("eu jogo?"): placar confirmados:vagas, com o mínimo embaixo ("faltam 2 para fechar · mínimo 10" ou "Jogo confirmado ✓", GRP-46). Para quem tem `game.manage`, antes do início e com o jogo valendo, o botão "Vagas deste jogo" embaixo do placar abre o painel (vagas, mínimo e "Usar o padrão do grupo", GRP-45), e um valor só do jogo aparece marcado ("só neste jogo"). Depois, ação conforme o estado, abertura das camadas, a **linha Times**, Escalação (uma linha por vaga) e Banco (só com fila). Cada pessoa da lista mostra as suas posições, convidados inclusive, e o dono as muda ali ([TIM-05](times.md));
    - a **linha Times** é um atalho de uma linha para a aba Times. Para quem está num time publicado: "Você está no Time 2". Com times publicados e a pessoa fora deles: "Times publicados". Para o dono, o estado: "Times: ainda não montados", "Times: rascunho" ou "Times: publicados". Sem times publicados, quem não é dono não vê a linha. Com o jogo cancelado, a linha some;
    - a **linha Competição**, para quem tem `results.record`, com o jogo já começado (em andamento, ou cancelado com o horário passado) e a competição ativa: "Fechar o jogo" ou "Jogo fechado · corrigir", que abre o painel de fechar ([CMP-17](competicao.md)). _(Alterada em 2026-11-14.)_
  - **Times**: os times do jogo da semana ([TIM-14](times.md));
  - **Membros**: membros e reservas separados, cada parte com a contagem e o limite ("Membros · 13/14"). Cada pessoa mostra as suas posições, e o dono as muda ali ([TIM-05](times.md)). As ações do dono sobre a pessoa ficam no menu "⋮" da linha: "Remover" e, na reserva, "Convidar para membro" (só com lugar livre) ou, com o convite pendente, a marca "convite enviado" e "Cancelar convite". No fim da aba, quem não é dono tem "Sair do grupo" (GRP-43);
    - **os links moram aqui:** o "Convidar" do dono abre o painel com o link de membro e o de reserva (e o do jogo, com os convidados ligados), cada um com Copiar e "Gerar outro link" (GRP-07, 08);
  - **Ajustes**: é **uma lista**: cada linha tem o nome, o resumo do valor de agora e abre o lugar de mudar. Nada é editado direto na lista. Cada um vê só as linhas que pode mudar: 1–3 e 7 com `settings.edit`, 4–6 com `teams.manage`, 8 conforme a [CMP-10](competicao.md), cancelar e reabrir com `game.manage`, e arquivar só o dono:
    1. **Abertura da lista**: "Membros 07/11, 19:00 · Reservas 09/11, 19:00 · Convidados desligado" → o editor de camadas;
    2. **Vagas e mínimo**: "14 vagas · sem mínimo" → o painel das vagas padrão (GRP-45, 46);
    3. **Limites**: "30 membros · 30 reservas" → o painel dos limites (GRP-38);
    4. **Times**: "2 times · espalha homens e mulheres" → o painel da quantidade padrão e dos interruptores ([TIM-21](times.md));
    5. **Regras dos times**: "3 regras" → o painel das regras ([TIM-21](times.md));
    6. **Times opostos**: "2 regras" → o painel dos times opostos ([TIM-21](times.md));
    7. **Logo e capa**: as miniaturas → o painel com Trocar e Remover de cada um (GRP-35);
       7a. **Lugares**: "Quadra do clube · mais 2" (o padrão primeiro) → o painel dos lugares, com o padrão marcado, "Usar como padrão", Editar, Arquivar e, no fim, "Adicionar lugar" e os arquivados (com Desarquivar) (GRP-60–62). Na lista, a linha é da `settings.edit`, como a 7;
    8. **Competição**: o estado e o resumo dos pontos → o painel de começar o teste (dono) ou o do regulamento ([CMP-10](competicao.md));
    9. no fim, separada, a **zona de perigo**, com cancelar o jogo (ou **reabrir o jogo**, quando ele está cancelado, GRP-44) e **arquivar o grupo**.
  - _Por quê:_ cada aba responde a uma pergunta só. Montar os times é trabalho do dono que empurrava a Escalação para baixo e mostrava as mesmas pessoas duas vezes na aba Jogo. Nos Ajustes, o resumo mostra como o grupo está sem abrir nada, e os campos só aparecem quando o dono vai mudar. Os links servem para convidar, então ficam onde se convida. Toda linha dos Ajustes abre um painel de baixo, e nenhuma leva para outra página.
  - A reserva com convite pendente vê, no topo da página, a faixa "Você foi convidado para ser membro", com Aceitar e Recusar (GRP-41). Ao aceitar, a página recarrega com o papel novo.
  - Arquivar pede confirmação: "O grupo sai da lista de todos, os links param de funcionar e o jogo desta semana é cancelado. Dá para desarquivar depois." Depois de arquivar, a pessoa continua na página, que passa a ser a do grupo arquivado (GRP-37).
  - Reabrir pede confirmação: "Reabrir o jogo de {data}? Quem estava na lista volta na mesma posição e é avisado." Só aparece antes do início. _(Alterada em 2026-11-10: entrou reabrir o jogo.)_
  - Quem não tem nenhuma das permissões dos Ajustes e abre a aba é levado para a aba Jogo. Mesmo assim, a api continua barrando as ações (GRP-52), e a tela se ajusta (GRP-57).
  - _(Alterada em 2026-11-10: antes, a zona de perigo só tinha cancelar o jogo. Depois, entraram os limites, o convite para membro e sair do grupo. Em 2026-11-11, as posições nas abas Jogo e Membros, o menu "⋮" na aba Membros e o card Times. Em 2026-11-12, as abas viraram quatro, com os times numa aba própria; os Ajustes viraram uma lista com resumo; os links saíram dos Ajustes e ficaram só no "Convidar"; e a contagem saiu do nome da aba Membros. Em 2026-11-13, a página Ajustes › Times virou as linhas Times, Regras dos times e Times opostos, cada uma com o seu painel.)_
- **GRP-56. Cargos na tela:**
  - Na aba **Membros**, o Dono e o Admin mostram a marca do cargo ("Dono", "Admin") ao lado do nome. O Membro não tem marca. Todos veem.
  - No menu "⋮" de cada membro e reserva, **só o dono** tem "Tornar admin" ou, para quem já é, "Tirar de admin" (GRP-51). Sem confirmação: dá para desfazer na hora.
  - No menu "⋮" de um **membro**, só o dono tem "Passar o grupo para {nome}" (GRP-54). Pede confirmação: "{nome} vira dono do grupo, e você continua como admin. Só {nome} pode desfazer." Depois, a página recarrega com as permissões novas.
  - Com `members.manage` e sem ser dono, o "⋮" de quem é Admin não tem "Remover" (GRP-53).
  - Com o grupo arquivado, nenhuma dessas ações aparece (GRP-37).
  - _Por quê:_ dar e tirar o cargo fica junto das outras ações sobre a pessoa. Passar o grupo pede confirmação porque o dono antigo não consegue desfazer sozinho.
- **GRP-57. A página do grupo acompanha as permissões de quem vê** (GRP-55):
  - **Ação barrada:** qualquer ação na página do grupo (abas, painéis dos Ajustes, aba Times, posições) que recebe `GROUP_PERMISSION_DENIED` ou `GROUP_NOT_OWNER` mostra "Suas permissões neste grupo mudaram", no lugar da mensagem do erro, e recarrega o grupo. A tela passa a mostrar só o que a pessoa pode (GRP-29, 56): o painel de uma ação que ela não pode mais fazer fecha, e quem estava nos Ajustes sem poder mudar nada neles vai para a aba Jogo.
  - **Volta para a aba do navegador:** com a página do grupo aberta, voltar para a aba relê o grupo, o jogo e os membros, se a última leitura tem 1 min ou mais. Nunca há duas leituras ao mesmo tempo. Um painel aberto que a pessoa ainda pode usar continua aberto, com o que ela estava digitando.
  - Sem tempo real e sem consulta periódica: com a tela parada e visível, a mudança aparece na próxima ação ou na próxima volta para a aba.
  - _Por quê:_ a tela nunca fica mostrando botões que a api já recusou. O caso comum é o dono tirar o cargo e a pessoa abrir o app depois, e a volta para a aba cobre isso sem gastar chamadas. Tempo real exigiria infra nova para um caso raro. O mínimo de 1 min evita uma leitura a cada troca de aba, como no sino (NTF-09).
- **GRP-43. Sair do grupo pede confirmação:** "Você perde o acesso ao grupo e a sua vaga no jogo desta semana. Para voltar, vai precisar de um link." Depois de sair, a pessoa vai para `/groups`.
- **GRP-30. O card e o topo da página do grupo mostram o logo e a capa** (GRP-35). Se o grupo não tiver um deles, aquele lugar usa uma cor fixa calculada do id do grupo, e o logo mostra as iniciais do nome. _(Alterada em 2026-11-10: antes, logo e capa não existiam e todos os grupos usavam a cor.)_
- **GRP-37. A página de um grupo arquivado é só leitura** (vale a GRP-32):
  - no topo, a faixa "Grupo arquivado em {data}";
  - **Jogo** e **Times**: só o aviso "Grupo arquivado, sem jogo", sem placar, lista nem times;
  - **Membros**: a lista, sem remover, convidar para membro (nem o "Convidar") nem sair;
  - **Ajustes**: só aparece para o dono (desarquivar é só dele, GRP-49), com só o botão "Desarquivar grupo", sem confirmação. A lista dos Ajustes fica escondida. Ao desarquivar, a página volta a ser a de um grupo ativo, com os 3 links novos (GRP-33).
  - Se uma ação na página ativa recebe `GROUP_ARCHIVED` (o dono arquivou enquanto a tela estava aberta), a mensagem traduzida aparece e a página recarrega como arquivada.
  - _Por quê:_ mostrar só o que a api aceita evita botões que sempre dariam erro. Desarquivar não pede confirmação porque não perde nada.
- **GRP-34. Criar grupo é um painel, não uma tela.** `/groups/new` abre o painel de baixo por cima da tela de Grupos (o voltar do navegador fecha). O form pede só nome, esporte (do catálogo, GRP-58), dia da semana, horário e vagas, e não manda nenhuma camada (vale a GRP-15). Ao criar, o painel fecha e a pessoa vai para a página do grupo novo, com o aviso de que a abertura da lista pode ser ajustada nos Ajustes.
  - _Por quê:_ criar o grupo fica rápido, sem sair da lista. As camadas têm padrão e são ajustadas depois, num lugar só.

## 3. Como funciona

### Dados (single-table, sem GSI, ver [`dynamodb.md`](../../.claude/rules/dynamodb.md))

| Item                 | Chave                                                         | Para quê                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grupo                | `GROUP#<id>` / `META`                                         | a identidade: `name`, `sportId` (GRP-58), `timeZone` (GRP-13), `archivedAt` (GRP-31), `logoMediaId` e `coverMediaId` (GRP-35; as URLs são montadas na resposta, MID-12 em [midia.md](midia.md)). Sem segredo, sem dono e sem padrão do jogo ([ADR 0015](../decisions/0015-modelo-do-grupo-e-do-jogo.md)). Todo módulo lê por GetItem                                                |
| Ajustes do grupo     | `GROUP#<id>` / `SETTINGS`                                     | o padrão do jogo: `weekday` e `time` (até virem os horários, ADR 0015), `defaultPlaceId?` (GRP-62), `slots`, `minPlayers` (GRP-45, 46), as 3 camadas (GRP-14) e os limites `maxMembers`/`maxReserves` (GRP-38). Muda pelo `PATCH /groups/{id}` (GRP-16). A `version` dele sai no grupo como `settingsVersion` (GRP-59)                                                              |
| Links do grupo       | `GROUP#<id>` / `INVITES`                                      | os 3 tokens (GRP-07). Lido junto com o grupo; os tokens só saem na resposta para quem tem `members.manage` (GRP-05). Apagado ao arquivar e recriado com tokens novos ao desarquivar (GRP-31, 33)                                                                                                                                                                                    |
| Contagem do grupo    | `GROUP#<id>` / `COUNTERS`                                     | `memberCount`, `reserveCount` e `placeCount` (os lugares ativos, GRP-60); os dois primeiros mudam com `ADD` na mesma transação da entrada, da promoção, da remoção e da saída (GRP-39). A condição do limite fica neste item, conferindo o limite do `SETTINGS`                                                                                                                     |
| Participação         | `GROUP#<id>` / `MEMBER#<userId>`                              | `createdAt` (a data de entrada, GRP-03), `tier` (o papel: `member` ou `reserve`) e `roleId` (o cargo: `owner`, `admin` ou `member`, GRP-48, 50). Os membros do grupo são uma Query nesta partição (`begins_with(SK, "MEMBER#")`), sem lookup ([ADR 0009](../decisions/0009-entidade-de-relacao-chave-natural.md), [0014](../decisions/0014-itens-do-grupo-na-particao-do-grupo.md)) |
| Convite para membro  | `GROUP#<id>` / `MEMBER_INVITE#<userId>`                       | `expiresAt`, com `ttl` (GRP-40, [ADR 0004](../decisions/0004-ttl-com-expiresat.md)). Apagado quando a reserva vira membro, recusa, sai ou é removida                                                                                                                                                                                                                                |
| Lugar                | `GROUP#<id>` / `PLACE#<placeId>`                              | `id`, `name`, `address` (`street`, `number?`, `district?`, `city`, `state`, `country`, `postalCode?`), `lat`, `lng`, `archivedAt?` (GRP-60, 61). A lista é uma Query `begins_with(SK, "PLACE#")`. O limite de ativos é o `placeCount` do `COUNTERS`, com `ADD` e condição (`< 10`) ao cadastrar e desarquivar, e `-1` ao arquivar                                                   |
| Grupos da pessoa     | `LOOKUP#USER#<userId>#GROUP` / `<groupId>`                    | "meus grupos": Query → BatchGet do `META`, do `SETTINGS`, do `INVITES` e da `MEMBER#<userId>` de cada grupo                                                                                                                                                                                                                                                                         |
| Grupos de um esporte | `LOOKUP#SPORT#<sportId>#GROUP` / `<groupId>`                  | o filtro por esporte (ainda sem rota). Gravado na mesma transação que cria o grupo (GRP-58)                                                                                                                                                                                                                                                                                         |
| Link → grupo (3)     | `LOOKUP#GROUP#{INVITE,RESERVE_INVITE,GUEST}#<token>` / `META` | abrir o link (GRP-07)                                                                                                                                                                                                                                                                                                                                                               |
| Jogo                 | `GAME#<id>` / `META`                                          | existe só depois da 1ª escrita (GRP-10); `cancelledAt`; `slots` e `minPlayers` só do jogo (GRP-45, 46); `minReachedAt` (o 1º aviso, GRP-47)                                                                                                                                                                                                                                         |
| Jogo pela data       | `LOOKUP#GAME#<groupId>#<data>` / `META`                       | duas confirmações simultâneas não criam 2 jogos                                                                                                                                                                                                                                                                                                                                     |
| Presença             | `ATTENDANCE#<id>` / `META`                                    | `{ gameId, userId, confirmedAt }`                                                                                                                                                                                                                                                                                                                                                   |
| Ordem da lista       | `LOOKUP#GAME#<gameId>#ATTENDANCE` / `<confirmedAt>#<userId>`  | a posição na Query é a posição na lista (GRP-19)                                                                                                                                                                                                                                                                                                                                    |
| Presença da pessoa   | `LOOKUP#GAME#<gameId>#ATTENDANCE#USER#<userId>` / `META`      | uma presença por pessoa (GRP-20)                                                                                                                                                                                                                                                                                                                                                    |

Os detalhes de cada chave e transação estão nos comentários de `group.table.ts`, `membership.table.ts` e `game.table.ts`. O jogo e a presença mudam na tarefa do jogo (ADR 0015).

**Cargos (GRP-48–55):** o catálogo de permissões e os 3 cargos (GRP-50) ficam no código (`@scorely/contracts`), e não no banco. A participação guarda só o `roleId`. Conferir a permissão não custa leitura a mais: a participação já é lida para saber se a pessoa participa (GRP-04). Quando vierem os cargos criados pelo grupo (seção 5), eles entram em `GROUP#<id>/ROLES`, lido junto com a participação num BatchGet. Um `roleId` sem cargo conta como Membro (GRP-52), então apagar um cargo não mexe nas participações.

**Grupo na tela:** o grupo é um BatchGet do `META`, do `SETTINGS` e do `INVITES`, junto com a leitura da `MEMBER#<eu>` (e do `MEMBER_INVITE#<eu>`). A partição inteira nunca é lida só para pegar o `META` (ADR 0014).

### Onde está cada regra

| Arquivo                                                                           | O que tem                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/.../group.service.ts`                                                        | criar, camadas, links, entrar, membros, remover, arquivar (GRP-01–09, 14–16, 25–26, 31–33), limites, convite para membro e sair (GRP-38–42), cargos e passar o grupo (GRP-48, 51, 53–55) |
| `api/.../game.service.ts`                                                         | jogo atual, lista, fila, promoção, cancelar, link do jogo (GRP-10–12, 17–24)                                                                                                             |
| `api/.../group.images.ts`                                                         | logo e capa: permissão do dono e chamada à mídia (GRP-35)                                                                                                                                |
| `api/.../groups.deps.ts`                                                          | acesso e permissões (GRP-04, 05, 49, 52), grupo arquivado (GRP-32) e padrão das reservas (GRP-15)                                                                                        |
| `contracts/src/groups.ts`                                                         | catálogo de permissões e o cargo Admin (GRP-49, 50)                                                                                                                                      |
| `api/src/lib/zoned.ts`                                                            | ocorrência, estados e fuso (GRP-10, 12, 13)                                                                                                                                              |
| `web/.../groups.ts`, `tabs.ts`, `layers.ts`, `scoreboard.ts`, `links.ts`          | regras das telas em funções puras (GRP-27–30, 37)                                                                                                                                        |
| `web/.../groups/permissions.ts`                                                   | o que quem vê pode fazer, pelo `myPermissions`, quando a aba Ajustes aparece, quando a tela relê e o `onPermissionError` dos painéis (GRP-29, 55–57)                                     |
| `web/.../groups/settings.ts`                                                      | resumos das linhas dos Ajustes: vagas e mínimo, limites (GRP-29)                                                                                                                         |
| `web/.../pages/GroupPage.vue`, `GroupTeamsPage.vue`, `components/SettingsRow.vue` | as 4 abas, a aba Times, a linha da lista dos Ajustes e a releitura das permissões (GRP-29, 37, 57)                                                                                       |
| `web/.../components/LimitsCard.vue`                                               | limites nos Ajustes (GRP-38)                                                                                                                                                             |
| `api/.../place.repository.ts`, `place.service.ts`                                 | lugares: limite, versão, arquivar e o padrão (GRP-60–62)                                                                                                                                 |
| `web/.../groups/places.ts`, `components/PlacesCard.vue`                           | o ponto pelo link, a rota, o endereço e a linha Lugares dos Ajustes (GRP-29, 60–63)                                                                                                      |
| `web/.../components/GroupCreateForm.vue`                                          | criar grupo no painel, sem camadas (GRP-34)                                                                                                                                              |

### Rotas

| Rota                                                                                                             | Quem             | Regras                |
| ---------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------- |
| `POST /groups`                                                                                                   | logado           | GRP-01, 13–15, 58     |
| `GET /me/groups`                                                                                                 | logado           | GRP-27, 28, 31        |
| `GET /me/groups/archived`                                                                                        | logado           | GRP-27, 31            |
| `POST /groups/{id}/archive`                                                                                      | dono             | GRP-31                |
| `POST /groups/{id}/unarchive`                                                                                    | dono             | GRP-33                |
| `GET /groups/{id}`                                                                                               | membro/reserva   | GRP-04, 05, 55        |
| `PATCH /groups/{id}`                                                                                             | `settings.edit`  | GRP-14, 16, 45–47, 59 |
| `POST /groups/{id}/invite` `{ kind }`                                                                            | `members.manage` | GRP-07, 08            |
| `POST /groups/{id}/images/{slot}/upload`, `PUT`/`DELETE /groups/{id}/images/{slot}` (`slot` = `logo` ou `cover`) | `settings.edit`  | GRP-35 (MID-03–11)    |
| `GET /groups/{id}/places`                                                                                        | membro/reserva   | GRP-60, 61, 63        |
| `POST /groups/{id}/places`, `PUT /groups/{id}/places/{placeId}` `{ version, ... }`                               | `settings.edit`  | GRP-60                |
| `POST /groups/{id}/places/{placeId}/archive`, `/unarchive` `{ version }`                                         | `settings.edit`  | GRP-61                |
| `POST /invites/{token}/accept`                                                                                   | logado           | GRP-02                |
| `GET /groups/{id}/members`                                                                                       | membro/reserva   | GRP-06, 55            |
| `DELETE /groups/{id}/members/{userId}`                                                                           | `members.manage` | GRP-25, 26, 53        |
| `POST`/`DELETE /groups/{id}/members/{userId}/member-invite`                                                      | `members.manage` | GRP-40                |
| `PUT /groups/{id}/members/{userId}/staff-role` `{ roleId: "admin" }`, `DELETE`                                   | dono             | GRP-51                |
| `POST /groups/{id}/transfer` `{ userId }`                                                                        | dono             | GRP-54                |
| `POST /groups/{id}/member-invite/accept`, `POST /groups/{id}/member-invite/decline`                              | reserva          | GRP-41                |
| `POST /groups/{id}/leave`                                                                                        | membro/reserva   | GRP-42                |
| `GET /groups/{id}/games/current`                                                                                 | membro/reserva   | GRP-10–12, 17         |
| `POST`/`DELETE /groups/{id}/games/{date}/attendance`                                                             | membro/reserva   | GRP-17–22             |
| `POST /groups/{id}/games/{date}/cancel`                                                                          | `game.manage`    | GRP-24                |
| `POST /groups/{id}/games/{date}/reopen`                                                                          | `game.manage`    | GRP-44                |
| `PATCH /groups/{id}/games/{date}`                                                                                | `game.manage`    | GRP-45–47             |
| `GET /play/{token}`, `POST`/`DELETE /play/{token}/games/{date}/attendance`                                       | logado           | GRP-08, 09, 17–22     |

Na coluna "Quem", uma permissão quer dizer o dono ou quem tem um cargo com ela (GRP-49).

Erros: `GROUP_NOT_FOUND`, `GROUP_NOT_OWNER`, `GROUP_PERMISSION_DENIED`, `GROUP_INVITE_INVALID`, `GROUP_MEMBER_NOT_FOUND`, `GROUP_OWNER_NOT_REMOVABLE`, `GROUP_LAYERS_INVALID`, `GAME_NOT_FOUND`, `GAME_LIST_NOT_OPEN`, `GAME_CLOSED`, `GAME_CANCELLED`, `GAME_LINK_INVALID`, `GROUP_ARCHIVED`, `GROUP_MEMBERS_FULL`, `GROUP_RESERVES_FULL`, `GROUP_MEMBER_INVITE_INVALID`, `GAME_SLOTS_BELOW_CONFIRMED`, `GROUP_MIN_PLAYERS_INVALID`, `SPORT_NOT_FOUND`, `VERSION_CONFLICT` (409, GRP-59), `PLACE_NOT_FOUND` (404), `PLACE_LIMIT_REACHED` (409, `details.max`), `PLACE_IS_DEFAULT` (409) (catálogo em `api/src/lib/errors.ts`). Os erros do logo e da capa vêm da mídia (`MEDIA_*`).

## 4. Limites conhecidos

- O link curto do Google Maps (`maps.app.goo.gl`) não traz as coordenadas, e o navegador não consegue abri-lo para descobrir. A pessoa precisa colar o link completo ou usar a localização do aparelho (GRP-60).
- O endereço não é conferido com o ponto do mapa: dá para salvar um endereço e um ponto diferentes.
- Se duas pessoas de dentro saem ao mesmo tempo, o aviso de promoção pode ir duas vezes para a mesma pessoa da fila e pular outra. A lista fica certa; só o aviso falha.
- Não há histórico de jogos (GRP-11) nem como editar nome e horário (GRP-16).
- Um jogo não fica sem mínimo se o grupo tem um: dá para mudar o mínimo do jogo, não desligar só nele (GRP-46).
- O aviso de jogo confirmado vem de quem gravou a mudança. Duas confirmações ao mesmo tempo que chegam juntas ao mínimo podem avisar duas vezes (como o aviso de promoção).
- O dono não é avisado quando alguém sai, aceita ou recusa o convite para membro (GRP-41, 42). Ele vê a mudança na lista de membros.
- Não dá para rebaixar um membro a reserva. O dono teria que remover e mandar o link de reserva.
- A tela só percebe que as permissões mudaram numa ação barrada ou ao voltar para a aba (GRP-57). Com a tela parada e visível, a pessoa ainda vê os botões antigos.
- A permissão é conferida ao começar a ação (GRP-52), e não dentro da gravação. Se o dono tira o cargo de alguém no mesmo instante em que essa pessoa age, a ação ainda pode ser gravada.
- A reserva com `members.manage` vê o link de membro (GRP-05) e, se abrir esse link, vira membro (GRP-02), como qualquer pessoa com o link. O convite para si mesma é barrado (GRP-40), mas esse caminho não.
- Os cargos são só Dono, Admin e Membro (GRP-50). Quem precisa de alguém que só monte os times precisa esperar os cargos criados pelo grupo (seção 5).
- Arquivar faz duas escritas: primeiro arquiva o grupo, depois cancela o jogo. Se a segunda falhar, o grupo fica arquivado com o jogo aberto, mas ninguém consegue confirmar (GRP-32), e arquivar de novo completa o cancelamento (GRP-31).
- No mesmo instante do arquivamento, só confirmar, remover e trocar link são barrados dentro da gravação (GRP-24, GRP-32). Desistir e mudar as camadas que chegam nesse instante ainda podem ser gravados. Trocar um link nesse instante dá erro 500, e nenhum link volta a valer.

## 5. Em discussão (ainda não é regra)

- Próximas entregas: a competição (pontos, ranking, temporadas e prêmios) é o módulo [Competição](competicao.md), que substitui as antigas E4a e E4b. O roteiro está na seção 5 dele.
- **Resultado com placar e scout** (depois das temporadas, no módulo [Competição](competicao.md)): o grupo escolhe como conta: só vitória, placar por partida (ex.: 25×21) ou scout, com quem fez cada ponto e como (saque, bloqueio, ataque, erro do adversário). O placar entra na partida; cada ponto do scout vira um item ligado à partida.
- **Cargos criados pelo grupo** (decidido em 2026-11-13, depois dos GRP-48–56, se fizer falta): o dono cria, renomeia e apaga cargos (ex.: "Organizador", só com `teams.manage`), até 10 por grupo, guardados em `GROUP#<id>/ROLES`, com as permissões por área (`none`, `view` ou `edit`, ADR 0015). O Dono, o Admin e o Membro continuam existindo (o Membro passa a ser editável). As permissões passam a ser por área, e as próximas áreas entram com as entregas (ex.: as temporadas na [Competição](competicao.md)).
- **Agenda** (decidido em 2026-11-10, vira tarefa própria depois do GRP-44): horários fixos mais exceções, como num calendário.
  - O grupo passa a ter 1 ou mais horários semanais, e os jogos desses horários continuam calculados (GRP-10).
  - O dono cria **jogo avulso**, que é um jogo a mais (não substitui o da semana), com vagas próprias; e **remarca** um jogo específico.
  - Vagas e camadas são as do grupo para todos os horários, e cada jogo pode ter as suas vagas e o seu mínimo (GRP-45, 46).
  - Com mais de um jogo aberto, o "jogo atual" vira "Próximos jogos", e o jogo ganha id estável em vez da data. Mudam GRP-10, 11, 12 e 16.
  - Fases: (1) vários horários e "Próximos jogos"; (2) avulso; (3) remarcar; (4) editar horários e nome.

## Histórico

Esta é a primeira versão, montada a partir dos planos 003, 006, 007 e 012–015 e conferida com o código. Daqui em diante, o histórico é o `git log` deste arquivo.
