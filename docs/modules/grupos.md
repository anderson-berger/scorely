# Módulo Grupos

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Se o código e este doc discordarem, um dos dois está errado. Conferido com o código em 2026-11-11.

Código: `apps/scorely/api/src/modules/groups/`, `apps/scorely/web/src/modules/groups/`, contrato em `apps/scorely/contracts/src/groups.ts`.

## 1. Para que serve

Grupo esportivo recorrente (a "pelada" da semana). Resultado esperado: **o jogo da semana acontece sem confusão de lista**. Mais tarde, também com times equilibrados (E3 em diante, ver [PRODUCT.md](../product/PRODUCT.md)).

Caso de referência: vôlei misto de sexta, com 12 vagas. Os membros fixos têm prioridade. Se sobra vaga, entram as reservas e depois qualquer pessoa com o link do jogo.

### Vocabulário

| Termo               | Significado                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Dono                | quem criou o grupo. Há um só, e ele também é membro                                         |
| Membro              | participa do grupo e tem a janela de confirmação mais cedo                                  |
| Reserva             | participa do grupo e confirma depois dos membros                                            |
| Convidado           | não participa do grupo; confirma pelo link do jogo, depois das reservas                     |
| Jogo                | a ocorrência semanal do grupo. Só existe o **jogo atual**                                   |
| Camada              | janela de quando cada papel pode confirmar: membros → reservas → convidados                 |
| Lista               | quem confirmou, na ordem de chegada. As primeiras `vagas` pessoas estão **dentro**          |
| Fila                | quem confirmou com as vagas já ocupadas (o "Banco" na tela). Sobe sozinho quando alguém sai |
| Limite              | quantos membros e quantas reservas o grupo aceita. Não confundir com as vagas do jogo       |
| Convite para membro | pedido do dono, feito dentro do app, para uma reserva virar membro (GRP-40)                 |

## 2. Regras de negócio

Cada regra tem um id fixo (`GRP-NN`). O id não é reaproveitado: se uma regra sair, ela fica riscada com a data. Testes e código citam o id.

### Participação

- **GRP-01. Quem cria é dono e membro.** O grupo nasce com o criador como membro. O dono não pode ser removido.
- **GRP-02. Entrar pelo link define o papel.** O link de membro faz a pessoa entrar como membro, e o de reserva, como reserva.
  - Se uma reserva aceita o link de membro, ela **vira membro**.
  - Se um membro aceita o link de reserva, **nada muda**.
  - Entrar de novo também não muda nada.
  - Com os membros no limite, o link de membro responde `GROUP_MEMBERS_FULL`, e uma reserva que o abre continua reserva. Com as reservas no limite, o link de reserva responde `GROUP_RESERVES_FULL` (vale a GRP-39).
  - _Por quê:_ ninguém é rebaixado por engano ao clicar no link errado. _(Alterada em 2026-11-10: antes, os links não tinham limite.)_
- **GRP-03. A data de entrada nunca muda,** nem quando a reserva vira membro. A promoção fica registrada à parte (`roleChangedAt`).
- **GRP-04. Quem não participa não sabe que o grupo existe.** Qualquer rota do grupo responde `GROUP_NOT_FOUND` (404) para quem não é membro nem reserva.
  - Se um não dono tenta uma ação de dono, a resposta é `GROUP_NOT_OWNER` (403 com corpo).
  - _Por quê:_ não vaza a existência do grupo, e o 403 com corpo não dispara a renovação de sessão do web.
- **GRP-05. A reserva vê o que o membro vê** (grupo, jogo, lista, membros), mas não vê os links e não remove ninguém. Os três links só vão na resposta para o dono.
- **GRP-06. Ordem da lista de membros:** primeiro o dono, depois os membros e por último as reservas. Dentro de cada papel, ordena pela data de entrada, da mais antiga para a mais nova.

### Links

- **GRP-07. São três links, um por papel:** membro e reserva (`/join/<token>`) e jogo, para convidados (`/play/<token>`).
  - Gerar outro link **invalida o anterior na hora**. O link antigo responde `GROUP_INVITE_INVALID` ou `GAME_LINK_INVALID`.
  - _Por quê:_ é assim que o dono bloqueia alguém sem precisar de lista de bloqueio. O token não é segredo de login, então o dono pode rever o link atual quando quiser.
- **GRP-08. O link do jogo só funciona com os convidados ligados.** Com eles desligados, abrir, confirmar ou gerar o link responde `GAME_LINK_INVALID`.
- **GRP-09. O link do jogo leva sempre ao jogo atual.** Qualquer pessoa logada vê o nome do grupo, o horário, o local, a lista com nomes e os times publicados ([TIM-09](times.md)), e pode confirmar quando a camada dos convidados abre. _(Alterada em 2026-11-11: entraram os times publicados.)_
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
- **GRP-13. Fuso do grupo:** é o que vem no pedido. Se não vier, é o do perfil do dono, e se ele não tiver, `America/Sao_Paulo`.
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
  - Grupo antigo sem o campo das reservas: elas abrem junto com os membros.
  - _Por quê:_ quem cria o grupo não precisa decidir as camadas na hora (ver GRP-34), e o padrão é uma regra de negócio, então fica na api. O web não conhece esses números: ele só mostra o que a api gravou.
- **GRP-16. Só o dono muda as camadas, os limites, as vagas e o mínimo.** O `PATCH /groups/{id}` só aceita as três camadas (e `null` desliga os convidados), os dois limites (GRP-38), as vagas (GRP-45) e o mínimo (GRP-46, `null` desliga). Nome e horário ainda não podem ser mudados. _(Alterada em 2026-11-10: antes, só as camadas. Alterada em 2026-11-11: entraram as vagas e o mínimo.)_
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
  - O padrão vem da criação do grupo, e o dono muda nos Ajustes. O dono também muda as vagas **só do jogo atual** (`PATCH /groups/{id}/games/{date}`), e o padrão do grupo não muda. Sem valor próprio, o jogo usa o padrão, inclusive se ele mudar depois.
  - **Aumentar** as vagas faz quem está no Banco subir na ordem da fila, com o aviso de promoção (GRP-22).
  - **Diminuir** não pode deixar menos vagas do que quem já está dentro: a resposta é `GAME_SLOTS_BELOW_CONFIRMED` (409, `details.confirmed` = quantos estão dentro). Vale também para o padrão do grupo, quando o jogo atual não tem valor próprio.
  - O jogo pode voltar a usar o padrão do grupo ("Usar o padrão do grupo"), com as mesmas regras de aumentar e diminuir.
  - Mudar o jogo segue o prazo de confirmar (GRP-21): em andamento, `GAME_CLOSED`; cancelado, `GAME_CANCELLED`. Outra data, `GAME_NOT_FOUND` (GRP-11).
  - _Por quê:_ tem semana em que o grupo chama 14 em vez de 12. Não diminuir abaixo de quem está dentro mantém a GRP-18: quem confirmou dentro não é tirado da lista depois.
- **GRP-46. O mínimo para o jogo acontecer é opcional,** de 2 até as vagas. Também tem o padrão do grupo (nos Ajustes, desligado em grupo novo e nos antigos) e um valor só do jogo atual, como as vagas (GRP-45).
  - Com o mínimo, o jogo está **confirmado** quando o número de quem está dentro chega ao mínimo. Se alguém desiste e o número cai, ele volta a não estar confirmado.
  - Mínimo acima das vagas responde `GROUP_MIN_PLAYERS_INVALID` (422, `details.max` = as vagas). Isso vale ao mudar qualquer um dos dois.
  - O jogo não é cancelado sozinho por não chegar ao mínimo: quem decide cancelar é o dono (GRP-24).
  - _Por quê:_ com 10 de 12 já dá jogo. A lista precisa saber se o jogo vai acontecer, sem esperar fechar as 12. Cancelar sozinho precisaria de um horário de corte e de um agendador, que o jogo calculado não tem (GRP-10).
- **GRP-47. Aviso de jogo confirmado:** na **primeira** vez que o jogo atinge o mínimo (por uma confirmação, por mais vagas ou por um mínimo menor), o aviso `game_confirmed` vai para todos da lista (dentro e fila), menos o dono. Se o número cair e voltar ao mínimo, não avisa de novo.
  - O link é o grupo; para o convidado, o link do jogo (como o GRP-22).
  - _Por quê:_ é a notícia que todos esperam ("vai ter jogo"). Repetir a cada sobe e desce seria barulho.

### Cancelar e remover

- **GRP-24. Só o dono cancela o jogo atual, e só antes do início.** O aviso `game_cancelled` vai para todos da lista (dentro e fila), menos o dono.
  - Cancelar de novo devolve o jogo como está, sem avisar outra vez.
  - Quem confirma no mesmo instante do cancelamento **ou** recebe `GAME_CANCELLED` sem ser gravado, **ou** entra na lista e recebe o aviso. Nunca fica confirmado num jogo cancelado sem ser avisado.
  - _Por quê:_ a confirmação confere o jogo dentro da própria gravação, e não só antes dela. Assim, uma das duas operações sempre vem antes da outra.
- **GRP-44. Só o dono reabre o jogo cancelado, e só antes do início** (`POST /groups/{id}/games/{date}/reopen`):
  - a lista volta como estava: quem estava dentro continua dentro, e a fila, na mesma ordem;
  - o aviso `game_reopened` vai para todos da lista (dentro e fila), menos o dono;
  - reabrir um jogo que não está cancelado devolve o jogo como está, sem avisar ninguém;
  - com o jogo já no horário de início, a resposta é `GAME_CLOSED`, e com o grupo arquivado, `GROUP_ARCHIVED` (GRP-32). Um arquivamento no mesmo instante é barrado dentro da gravação: ou o jogo reabre antes e o arquivamento cancela de novo (GRP-31), ou a reabertura recebe `GROUP_ARCHIVED`;
  - cancelar de novo depois de reabrir avisa outra vez (GRP-24), com a data do novo cancelamento.
  - _Por quê:_ o dono cancela por engano, ou o motivo do cancelamento some (por exemplo, desarquivou o grupo, GRP-33). Manter a lista não tira a vaga de ninguém, e o aviso conta para quem já tinha feito outros planos.
- **GRP-25. O dono remove um membro ou uma reserva** (nunca a si mesmo: `GROUP_OWNER_NOT_REMOVABLE`). Numa operação só, a pessoa:
  - perde o acesso;
  - tem o link do seu papel trocado;
  - perde a vaga, se o jogo está `scheduled`, `open` ou `cancelled` e ela estava na lista. Com o jogo em andamento, a vaga fica. Com o jogo cancelado, ninguém é avisado de promoção (GRP-22); _(alterada em 2026-11-10: antes, com o jogo cancelado a vaga ficava, e voltaria com a reabertura, GRP-44)_
  - perde o convite para membro pendente, se tinha (GRP-40);
  - libera um lugar no limite do seu papel (GRP-39).
  - Depois vale a GRP-22. O removido não é notificado.
  - _Por quê:_ ela perde o acesso e a vaga de uma vez, e a troca do link impede que volte pelo link antigo.
- **GRP-26. Remoção ao mesmo tempo que outra mudança:** se a pessoa saiu antes, a resposta é `GROUP_MEMBER_NOT_FOUND`.
  - Se o papel ou o link mudaram no meio, a operação relê e tenta de novo, até 3 vezes.

### Limites, convite para membro e sair

- **GRP-38. O grupo tem um limite de membros e um de reservas.** Só o dono muda os dois, nos Ajustes (GRP-16).
  - Membros: de 2 a 30, contando o dono. Reservas: de 0 a 30. Com 0, o grupo não aceita reservas.
  - Grupo novo nasce com **30 membros e 30 reservas**. Quem decide o padrão é a api, como nas camadas (GRP-15), e o form de criar não pede os limites (GRP-34).
  - Abaixar um limite para menos do que o grupo já tem **não tira ninguém**. Só impede novas entradas naquele papel até sobrar lugar.
  - _Por quê:_ o dono controla o tamanho do grupo (ex.: 14 membros fixos), e o teto de 30 mantém a lista de membros e os avisos pequenos para o sistema.
- **GRP-39. O limite vale para toda entrada num papel:** pelo link (GRP-02) e pelo convite para membro (GRP-41). Duas entradas ao mesmo tempo nunca passam do limite: a segunda recebe `GROUP_MEMBERS_FULL` ou `GROUP_RESERVES_FULL`.
  - Uma reserva que vira membro ocupa um lugar de membro e libera um de reserva.
  - Remover (GRP-25) e sair (GRP-42) liberam o lugar na hora.
  - _Por quê:_ o limite é conferido dentro da própria gravação, e não só antes dela (como na GRP-24).
- **GRP-40. O dono convida uma reserva para virar membro, dentro do app.** Na lista de membros, ele escolhe a reserva, e ela recebe o aviso `member_invite`, com o link do grupo.
  - Só com lugar de membro livre. Com os membros no limite, convidar responde `GROUP_MEMBERS_FULL`.
  - Cada reserva tem no máximo um convite pendente. Convidar de novo devolve o pendente, sem avisar outra vez.
  - O convite vence em **7 dias**. Vencido, conta como inexistente, e o dono pode convidar de novo.
  - O dono pode cancelar o convite pendente. Cancelar um que não existe não faz nada.
  - Convidar quem não é reserva responde `GROUP_MEMBER_NOT_FOUND`.
  - **O convite não segura o lugar.** Quem entrar primeiro (pelo convite ou pelo link de membro) fica com ele.
  - _Por quê:_ o dono escolhe quem sobe sem espalhar o link de membro, que serve para qualquer pessoa. Segurar o lugar exigiria liberá-lo quando o convite vence, sem que ninguém precise fazer nada.
- **GRP-41. A reserva aceita ou recusa o convite** na página do grupo.
  - Aceitar faz dela membro, com o `roleChangedAt` (GRP-03), e só se ainda houver lugar. Sem lugar, a resposta é `GROUP_MEMBERS_FULL`, ela continua reserva e o convite continua valendo até vencer.
  - Recusar apaga o convite. O dono não é avisado: ele vê na lista que o convite sumiu.
  - Aceitar ou recusar sem convite pendente (vencido, cancelado ou já usado) responde `GROUP_MEMBER_INVITE_INVALID`.
  - Se a reserva vira membro pelo link de membro, o convite pendente é apagado.
- **GRP-42. Membros e reservas podem sair do grupo sozinhos.** O dono não pode: `GROUP_OWNER_NOT_REMOVABLE`. Numa operação só, quem sai:
  - perde o acesso;
  - perde a vaga no jogo, se ele está `scheduled`, `open` ou `cancelled` e ela estava na lista (como na GRP-25). Com o jogo em andamento, a vaga fica;
  - perde o convite para membro pendente, se tinha;
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
  - Pedir o jogo atual, confirmar, desistir, mudar as camadas ou os limites, trocar um link, remover alguém, cancelar o jogo, convidar para membro, aceitar ou recusar o convite e sair do grupo responde `GROUP_ARCHIVED` (409). _(Alterada em 2026-11-10: entraram os limites, o convite para membro e sair do grupo.)_
  - Quem confirma no mesmo instante do arquivamento recebe `GROUP_ARCHIVED` e não é gravado (como na GRP-24).
  - _Por quê do jogo atual:_ sem histórico (GRP-11), um grupo arquivado não tem jogo para mostrar.
- **GRP-33. Só o dono desarquiva.** O grupo volta para "meus grupos" de todos, com **três links novos**. Os links antigos não voltam a valer. Desarquivar um grupo ativo não muda nada.

### Logo e capa

- **GRP-35. Só o dono troca e remove o logo e a capa do grupo.** São as mídias de finalidade `group.logo` (512×512) e `group.cover` (1600×600), as duas até 2 MB e públicas (MID-02 em [midia.md](midia.md)). O envio, a conferência, a troca e a remoção seguem as regras da mídia.
  - Quem não é dono recebe `GROUP_NOT_OWNER`, tanto ao pedir o envio quanto ao confirmar (MID-01).
  - Com o grupo arquivado, pedir o envio, trocar ou remover responde `GROUP_ARCHIVED` (vale a GRP-32).
  - _Por quê:_ o logo e a capa identificam o grupo para todos, então quem decide é quem responde pelo grupo. Se um papel de admin chegar, só esta regra muda.
- **GRP-36. Todos que veem o grupo veem o logo e a capa:** membros, reservas e convidados pelo link do jogo (`logoUrl` e `coverUrl` no grupo).

### Telas (web)

- **GRP-27. A tela `/groups` tem três abas, e uma quarta quando há grupo arquivado** (na query `?tab=`):
  - **Próximos jogos**: todos os grupos ativos, do jogo mais próximo para o mais distante, com os cancelados no fim;
  - **Meus grupos**: os grupos ativos de que a pessoa é dona;
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
- **GRP-29. A página do grupo tem três abas:**
  - **Jogo**: placar confirmados:vagas, com o mínimo embaixo ("faltam 2 para fechar · mínimo 10" ou "Jogo confirmado ✓", GRP-46). Para o dono, antes do início e com o jogo valendo, o botão "Vagas deste jogo" embaixo do placar abre o painel (vagas, mínimo e "Usar o padrão do grupo", GRP-45), e um valor só do jogo aparece marcado ("só neste jogo"). Depois, ação conforme o estado, abertura das camadas, o card **Times** ([TIM-14](times.md)), Escalação (uma linha por vaga) e Banco (só com fila). Cada pessoa da lista mostra as suas posições, convidados inclusive, e o dono as muda ali ([TIM-05](times.md));
  - **Membros**: membros e reservas separados, cada parte com a contagem e o limite ("Membros · 13/14"). Cada pessoa mostra as suas posições, e o dono as muda ali ([TIM-05](times.md)). As ações do dono sobre a pessoa ficam no menu "⋮" da linha: "Remover" e, na reserva, "Convidar para membro" (só com lugar livre) ou, com o convite pendente, a marca "convite enviado" e "Cancelar convite". No fim da aba, quem não é dono tem "Sair do grupo" (GRP-43);
  - **Ajustes**: só para o dono. Tem camadas, **vagas e mínimo** padrão (GRP-45, 46), **limites** (GRP-38), links, logo e capa (GRP-35) e a zona de perigo, com cancelar o jogo (ou **reabrir o jogo**, quando ele está cancelado, GRP-44) e **arquivar o grupo**.
  - A reserva com convite pendente vê, no topo da página, a faixa "Você foi convidado para ser membro", com Aceitar e Recusar (GRP-41). Ao aceitar, a página recarrega com o papel novo.
  - Arquivar pede confirmação: "O grupo sai da lista de todos, os links param de funcionar e o jogo desta semana é cancelado. Dá para desarquivar depois." Depois de arquivar, a pessoa continua na página, que passa a ser a do grupo arquivado (GRP-37).
  - Reabrir pede confirmação: "Reabrir o jogo de {data}? Quem estava na lista volta na mesma posição e é avisado." Só aparece antes do início. _(Alterada em 2026-11-10: entrou reabrir o jogo.)_
  - Quem não é dono e abre os Ajustes é levado para a aba Jogo. Mesmo assim, a api continua barrando as ações de dono.
  - _(Alterada em 2026-11-10: antes, a zona de perigo só tinha cancelar o jogo. Depois, entraram os limites, o convite para membro e sair do grupo. Em 2026-11-11, as posições nas abas Jogo e Membros, o menu "⋮" na aba Membros e o card Times.)_
- **GRP-43. Sair do grupo pede confirmação:** "Você perde o acesso ao grupo e a sua vaga no jogo desta semana. Para voltar, vai precisar de um link." Depois de sair, a pessoa vai para `/groups`.
- **GRP-30. O card e o topo da página do grupo mostram o logo e a capa** (GRP-35). Se o grupo não tiver um deles, aquele lugar usa uma cor fixa calculada do id do grupo, e o logo mostra as iniciais do nome. _(Alterada em 2026-11-10: antes, logo e capa não existiam e todos os grupos usavam a cor.)_
- **GRP-37. A página de um grupo arquivado é só leitura** (vale a GRP-32):
  - no topo, a faixa "Grupo arquivado em {data}";
  - **Jogo**: só o aviso "Grupo arquivado, sem jogo", sem placar nem lista;
  - **Membros**: a lista, sem remover, convidar para membro nem sair;
  - **Ajustes** (dono): só o botão "Desarquivar grupo", sem confirmação. Camadas, links, logo e capa ficam escondidos. Ao desarquivar, a página volta a ser a de um grupo ativo, com os 3 links novos (GRP-33).
  - Se uma ação na página ativa recebe `GROUP_ARCHIVED` (o dono arquivou enquanto a tela estava aberta), a mensagem traduzida aparece e a página recarrega como arquivada.
  - _Por quê:_ mostrar só o que a api aceita evita botões que sempre dariam erro. Desarquivar não pede confirmação porque não perde nada.
- **GRP-34. Criar grupo é um painel, não uma tela.** `/groups/new` abre o painel de baixo por cima da tela de Grupos (o voltar do navegador fecha). O form pede só nome, esporte, dia da semana, horário e vagas, e não manda nenhuma camada (vale a GRP-15). Ao criar, o painel fecha e a pessoa vai para a página do grupo novo, com o aviso de que a abertura da lista pode ser ajustada nos Ajustes.
  - _Por quê:_ criar o grupo fica rápido, sem sair da lista. As camadas têm padrão e são ajustadas depois, num lugar só.

## 3. Como funciona

### Dados (single-table, sem GSI, ver [`dynamodb.md`](../../.claude/rules/dynamodb.md))

| Item                   | Chave                                                         | Para quê                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grupo                  | `GROUP#<id>` / `META`                                         | dados, camadas, limites `maxMembers`/`maxReserves` (GRP-38), os 3 tokens (ausentes quando arquivado), `ownerId`, `archivedAt` (GRP-31), `logoMediaId`/`logoUrl` e `coverMediaId`/`coverUrl` (GRP-35) |
| Link → grupo (3)       | `LOOKUP#GROUP#{INVITE,RESERVE_INVITE,GUEST}#<token>` / `META` | abrir o link (GRP-07)                                                                                                                                                                                |
| Contagem do grupo      | `GROUP#<id>` / `COUNTERS`                                     | `memberCount` e `reserveCount`, que mudam com `ADD` na mesma transação da entrada, da promoção, da remoção e da saída (GRP-39). Os limites ficam no `META`                                           |
| Participação           | `MEMBERSHIP#<groupId>#<userId>` / `META`                      | papel, data de entrada e `memberInviteExpiresAt`, o prazo do convite para membro pendente, conferido na leitura (GRP-40) ([ADR 0009](../decisions/0009-entidade-de-relacao-chave-natural.md))        |
| Participantes do grupo | `LOOKUP#GROUP#<groupId>#MEMBERSHIP` / `<userId>`              | lista de membros                                                                                                                                                                                     |
| Grupos da pessoa       | `LOOKUP#USER#<userId>#GROUP` / `<groupId>`                    | "meus grupos"                                                                                                                                                                                        |
| Jogo                   | `GAME#<id>` / `META`                                          | existe só depois da 1ª escrita (GRP-10); `cancelledAt`; `slots` e `minPlayers` só do jogo (GRP-45, 46); `minReachedAt` (o 1º aviso, GRP-47)                                                          |
| Jogo pela data         | `LOOKUP#GAME#<groupId>#<data>` / `META`                       | duas confirmações simultâneas não criam 2 jogos                                                                                                                                                      |
| Presença               | `ATTENDANCE#<id>` / `META`                                    | `{ gameId, userId, confirmedAt }`                                                                                                                                                                    |
| Ordem da lista         | `LOOKUP#GAME#<gameId>#ATTENDANCE` / `<confirmedAt>#<userId>`  | a posição na Query é a posição na lista (GRP-19)                                                                                                                                                     |
| Presença da pessoa     | `LOOKUP#GAME#<gameId>#ATTENDANCE#USER#<userId>` / `META`      | uma presença por pessoa (GRP-20)                                                                                                                                                                     |

Os detalhes de cada chave e transação estão nos comentários de `group.table.ts`, `membership.table.ts` e `game.table.ts`.

### Onde está cada regra

| Arquivo                                                                  | O que tem                                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/.../group.service.ts`                                               | criar, camadas, links, entrar, membros, remover, arquivar (GRP-01–09, 14–16, 25–26, 31–33), limites, convite para membro e sair (GRP-38–42) |
| `api/.../game.service.ts`                                                | jogo atual, lista, fila, promoção, cancelar, link do jogo (GRP-10–12, 17–24)                                                                |
| `api/.../group.images.ts`                                                | logo e capa: permissão do dono e chamada à mídia (GRP-35)                                                                                   |
| `api/.../groups.deps.ts`                                                 | acesso (GRP-04, 05), grupo arquivado (GRP-32) e padrão das reservas (GRP-15)                                                                |
| `api/src/lib/zoned.ts`                                                   | ocorrência, estados e fuso (GRP-10, 12, 13)                                                                                                 |
| `web/.../groups.ts`, `tabs.ts`, `layers.ts`, `scoreboard.ts`, `links.ts` | regras das telas em funções puras (GRP-27–30, 37)                                                                                           |
| `web/.../components/LimitsCard.vue`                                      | limites nos Ajustes (GRP-38)                                                                                                                |
| `web/.../components/GroupCreateForm.vue`                                 | criar grupo no painel, sem camadas (GRP-34)                                                                                                 |

### Rotas

| Rota                                                                                                             | Quem           | Regras             |
| ---------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| `POST /groups`                                                                                                   | logado         | GRP-01, 13–15      |
| `GET /me/groups`                                                                                                 | logado         | GRP-27, 28, 31     |
| `GET /me/groups/archived`                                                                                        | logado         | GRP-27, 31         |
| `POST /groups/{id}/archive`                                                                                      | dono           | GRP-31             |
| `POST /groups/{id}/unarchive`                                                                                    | dono           | GRP-33             |
| `GET /groups/{id}`                                                                                               | membro/reserva | GRP-04, 05         |
| `PATCH /groups/{id}`                                                                                             | dono           | GRP-14, 16, 45–47  |
| `POST /groups/{id}/invite` `{ kind }`                                                                            | dono           | GRP-07, 08         |
| `POST /groups/{id}/images/{slot}/upload`, `PUT`/`DELETE /groups/{id}/images/{slot}` (`slot` = `logo` ou `cover`) | dono           | GRP-35 (MID-03–11) |
| `POST /invites/{token}/accept`                                                                                   | logado         | GRP-02             |
| `GET /groups/{id}/members`                                                                                       | membro/reserva | GRP-06             |
| `DELETE /groups/{id}/members/{userId}`                                                                           | dono           | GRP-25, 26         |
| `POST`/`DELETE /groups/{id}/members/{userId}/member-invite`                                                      | dono           | GRP-40             |
| `POST /groups/{id}/member-invite/accept`, `POST /groups/{id}/member-invite/decline`                              | reserva        | GRP-41             |
| `POST /groups/{id}/leave`                                                                                        | membro/reserva | GRP-42             |
| `GET /groups/{id}/games/current`                                                                                 | membro/reserva | GRP-10–12, 17      |
| `POST`/`DELETE /groups/{id}/games/{date}/attendance`                                                             | membro/reserva | GRP-17–22          |
| `POST /groups/{id}/games/{date}/cancel`                                                                          | dono           | GRP-24             |
| `POST /groups/{id}/games/{date}/reopen`                                                                          | dono           | GRP-44             |
| `PATCH /groups/{id}/games/{date}`                                                                                | dono           | GRP-45–47          |
| `GET /play/{token}`, `POST`/`DELETE /play/{token}/games/{date}/attendance`                                       | logado         | GRP-08, 09, 17–22  |

Erros: `GROUP_NOT_FOUND`, `GROUP_NOT_OWNER`, `GROUP_INVITE_INVALID`, `GROUP_MEMBER_NOT_FOUND`, `GROUP_OWNER_NOT_REMOVABLE`, `GROUP_LAYERS_INVALID`, `GAME_NOT_FOUND`, `GAME_LIST_NOT_OPEN`, `GAME_CLOSED`, `GAME_CANCELLED`, `GAME_LINK_INVALID`, `GROUP_ARCHIVED`, `GROUP_MEMBERS_FULL`, `GROUP_RESERVES_FULL`, `GROUP_MEMBER_INVITE_INVALID`, `GAME_SLOTS_BELOW_CONFIRMED`, `GROUP_MIN_PLAYERS_INVALID` (catálogo em `api/src/lib/errors.ts`). Os erros do logo e da capa vêm da mídia (`MEDIA_*`).

## 4. Limites conhecidos

- Se duas pessoas de dentro saem ao mesmo tempo, o aviso de promoção pode ir duas vezes para a mesma pessoa da fila e pular outra. A lista fica certa; só o aviso falha.
- Não há histórico de jogos (GRP-11) nem como editar nome e horário (GRP-16).
- Um jogo não fica sem mínimo se o grupo tem um: dá para mudar o mínimo do jogo, não desligar só nele (GRP-46).
- O aviso de jogo confirmado vem de quem gravou a mudança. Duas confirmações ao mesmo tempo que chegam juntas ao mínimo podem avisar duas vezes (como o aviso de promoção).
- O dono não é avisado quando alguém sai, aceita ou recusa o convite para membro (GRP-41, 42). Ele vê a mudança na lista de membros.
- Não dá para rebaixar um membro a reserva. O dono teria que remover e mandar o link de reserva.
- Arquivar faz duas escritas: primeiro arquiva o grupo, depois cancela o jogo. Se a segunda falhar, o grupo fica arquivado com o jogo aberto, mas ninguém consegue confirmar (GRP-32), e arquivar de novo completa o cancelamento (GRP-31).
- No mesmo instante do arquivamento, só confirmar, remover e trocar link são barrados dentro da gravação (GRP-24, GRP-32). Desistir e mudar as camadas que chegam nesse instante ainda podem ser gravados. Trocar um link nesse instante dá erro 500, e nenhum link volta a valer.

## 5. Em discussão (ainda não é regra)

- Remover o local do grupo: [plano 012-remover-local](../plans/012-remover-local-do-grupo.md), aguardando aprovação.
- Próximas entregas: times (E3, em andamento no módulo [Times](times.md)), histórico e partidas (E4a), ranking e temporadas (E4b), MVP (E5) e nível automático (E6), em [PRODUCT.md](../product/PRODUCT.md).
- **Histórico e partidas (E4a)**, desenhada e pausada em 2026-11-10 (a E3 vem antes): todo jogo que começou fica no histórico; cada partida guarda time 1 × time 2 e quem ganhou, registrada pelo dono a partir do início do jogo, sem prazo; a partida nova repete os times da anterior; vencedor do dia = mais vitórias no jogo (empate mostra todos, convidado incluído). Protótipo: https://claude.ai/artifact/HMuwy1PW3suJmuwwd93KNK. A recomendação é que partidas, contagem e, depois, ranking fiquem num módulo próprio (Resultados).
- **Ranking e temporadas (E4b)**, decidido em 2026-11-10: posição pelo total de vitórias, desempate pelo aproveitamento e depois pelos dias como vencedor do dia; geral (desde sempre) e por temporada, cada temporada com o seu pódio (top 3) congelado ao encerrar; recortes geral, masculino e feminino (gênero do perfil); **convidados aparecem nas partidas, mas não entram no ranking**; quem vira membro conta desde o começo.
- **Resultado com placar e scout** (depois da E4b): o grupo escolhe como conta: só vitória (como na E4a), placar por partida (ex.: 25×21) ou scout, com quem fez cada ponto e como (saque, bloqueio, ataque, erro do adversário). O placar entra na partida; cada ponto do scout vira um item ligado à partida.
- **Permissões** (módulo próprio, decidido em 2026-11-10): o dono cria grupos de permissão (ex.: "admin") e põe pessoas neles, para registrar partidas, cancelar jogo, criar jogo avulso etc. Muda as regras de "só o dono" (GRP-24, 35, ...) e o registro de partidas da E4a.
- **Agenda** (decidido em 2026-11-10, vira tarefa própria depois do GRP-44): horários fixos mais exceções, como num calendário.
  - O grupo passa a ter 1 ou mais horários semanais, e os jogos desses horários continuam calculados (GRP-10).
  - O dono cria **jogo avulso**, que é um jogo a mais (não substitui o da semana), com vagas próprias; e **remarca** um jogo específico.
  - Vagas e camadas são as do grupo para todos os horários, e cada jogo pode ter as suas vagas e o seu mínimo (GRP-45, 46).
  - Com mais de um jogo aberto, o "jogo atual" vira "Próximos jogos", e o jogo ganha id estável em vez da data. Mudam GRP-10, 11, 12 e 16.
  - Fases: (1) vários horários e "Próximos jogos"; (2) avulso; (3) remarcar; (4) editar horários e nome.

## Histórico

Esta é a primeira versão, montada a partir dos planos 003, 006, 007 e 012–015 e conferida com o código. Daqui em diante, o histórico é o `git log` deste arquivo.
