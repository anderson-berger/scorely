# Módulo Times

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Se o código e este doc discordarem, um dos dois está errado. Conferido com o código em 2026-11-12.

Código: `apps/scorely/api/src/modules/teams/`, `apps/scorely/web/src/modules/teams/`. Contrato: `apps/scorely/contracts/src/teams.ts`.

## 1. Para que serve

Montar os times do jogo da semana (ver [grupos.md](grupos.md)). O módulo é um **motor de composição**: as regras obrigatórias (ex.: 1 levantador por time) nunca são quebradas, e as preferências (ex.: espalhar homens e mulheres) são buscadas no melhor possível. O dono monta os times à mão ou sorteia, e os dois modos seguem as mesmas regras, que são do grupo. Resultado esperado: **times montados sem discussão na quadra**.

Caso de referência: vôlei misto de sexta, 12 vagas, 2 times de 6, 2 levantadores (um em cada time).

Hoje o módulo guarda as **posições de cada pessoa no grupo**, a **configuração de times do grupo** (quantidade padrão, regras de quantidade por time, times opostos e a preferência de espalhar homens e mulheres) e os **times do jogo**, montados à mão ou sorteados pelo dono seguindo as regras, com os **avulsos** que o dono põe só naquele jogo.

| Termo       | Significado                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jogador     | qualquer pessoa que joga no grupo: membro, reserva ou convidado. Tem posições **naquele grupo**                                                           |
| Posição     | onde a pessoa joga no esporte do grupo (ex.: levantador ou central no vôlei, goleiro no futebol). Pode não ter nenhuma                                    |
| Principal   | a posição em que a pessoa mais joga. É a primeira da lista dela, e é a que conta nas regras dos times (TIM-18)                                            |
| Regra       | o que todo time do grupo precisa ter, como "1 levantador por time" (TIM-18) ou "Ana e Bia em times diferentes" (TIM-22). O sorteio nunca quebra uma regra |
| Preferência | o que o sorteio busca o melhor possível, sem quebrar uma regra: espalhar homens e mulheres (TIM-23)                                                       |
| Avulso      | pessoa sem conta que o dono põe nos times de um jogo só, com nome, gênero e posições (TIM-24). Fora do ranking                                            |
| Times       | a divisão das pessoas do jogo em times ("Time 1", "Time 2"...). Uma por jogo, rascunho ou publicada                                                       |
| Sem time    | quem está dentro da lista (GRP-19) e ainda não foi posto em nenhum time                                                                                   |

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
  - só entra num time quem está na lista do jogo (dentro ou fila) ou é um avulso do jogo (TIM-24). Outra pessoa responde `TEAM_PLAYER_NOT_FOUND` (404);
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
- **TIM-15. Sortear:** o dono sorteia os times do jogo, com as mesmas permissões e o mesmo prazo de mexer nos times (TIM-07, TIM-11).
  - **Entra no sorteio:** todos de dentro da lista (incluindo os "sem time"), quem o dono já pôs num time vindo do Banco (TIM-08) e os avulsos do jogo (TIM-24). Quem está no Banco e não está em nenhum time fica de fora, e quem saiu da lista (TIM-12) sai dos times.
  - **Fica onde está:** quem o dono fixou (TIM-16). O resto é distribuído ao acaso.
  - **Tamanhos:** a diferença entre o maior e o menor time é de no máximo 1, contando os fixados. Se os fixados já passam disso (ex.: 4 fixados no Time 1 com 6 pessoas e 2 times), o sorteio completa primeiro os times menores.
  - **Regras:** o resultado cumpre todas as regras do grupo (TIM-19). Se não der, nada muda e o dono vê o que falta.
  - **Preferência:** com "Espalhar homens e mulheres" ligada, o resultado espalha os gêneros o melhor possível, sem quebrar as regras (TIM-23).
  - Usa a quantidade de times atual. Sem times salvos, usa a quantidade padrão do grupo (TIM-17).
  - Sortear de novo dá outro resultado (sem garantia de ser diferente, é sorte). As posições só do jogo (TIM-13) continuam valendo.
  - Com os times publicados, sortear **volta para rascunho**: os outros deixam de ver até o dono publicar de novo, e essa publicação não avisa outra vez (TIM-10).
  - _Por quê:_ sortear resolve "quem fica com quem" sem discussão; voltar para rascunho evita que a lista veja um sorteio que o dono ainda não conferiu.
  - _Alterada em 2026-11-12:_ antes não havia regras, e sem times salvos eram sempre 2 times. _Alterada de novo em 2026-11-12:_ avulsos e a preferência de gênero.
- **TIM-16. Fixar alguém num time:** o dono marca uma pessoa que está num time como **fixa**. Ela fica nesse time em todo sorteio (TIM-15), mesmo se tiver saído da lista, até o dono desafixar.
  - Mover uma pessoa fixa para outro time mantém a pessoa fixa, agora no novo time. Mover para "sem time" ou tirar dos times desafixa.
  - Só quem está num time pode ser fixo: fixar alguém fora dos times responde `VALIDATION_ERROR` (422).
  - Todos veem os times como sempre; a marca de fixo aparece só para o dono.
  - _Por quê:_ o dono já sabe que os dois levantadores ficam em times diferentes, ou que um casal joga junto, e quer sortear só o resto. Fixar é uma ação do dono no jogo, não uma regra do grupo (seção 5).

### Regras do grupo

- **TIM-17. Configuração de times do grupo:** cada grupo tem
  - a **quantidade padrão de times**, de 2 a 8 (padrão 2), usada ao "Montar à mão" e ao sortear sem times salvos (TIM-14, TIM-15). No jogo, o dono continua mudando a quantidade;
  - as **regras de quantidade por time** (TIM-18);
  - as regras de **times opostos** (TIM-22);
  - a preferência **"Espalhar homens e mulheres"** (padrão: desligada, TIM-23);
  - **"Permitir publicar times fora das regras"** (padrão: não, TIM-20).
  - Só o dono vê e muda (`GROUP_NOT_OWNER`; quem não participa recebe `GROUP_NOT_FOUND`). Com o grupo arquivado, mudar responde `GROUP_ARCHIVED` (GRP-32).
  - Mudar a configuração não mexe em times já montados: vale para o próximo sorteio e para o que a tela aponta como fora das regras (TIM-20).
  - _Por quê:_ as regras são do grupo, não de cada jogo. O vôlei de sexta sempre quer um levantador em cada time, e o dono não precisa repetir isso toda semana.
  - _Alterada em 2026-11-12:_ times opostos e a preferência de gênero.
- **TIM-18. Regra de quantidade por time:** "todo time tem no mínimo X e/ou no máximo Y" de
  - **uma posição do esporte** (TIM-02). Conta quem tem essa posição como **principal no jogo** (com o ajuste do jogo, TIM-13). Uma posição de outro esporte responde `TEAM_POSITION_INVALID`; no esporte "outro" só há regra de gênero;
  - ou **um gênero** (homens ou mulheres), pelo perfil da pessoa. Quem não informou o gênero não conta para nenhuma regra de gênero.
  - Mínimo e máximo de 0 a 50, pelo menos um dos dois, e o mínimo não passa do máximo. Até 10 regras, e cada posição ou gênero aparece numa regra só. Fora disso, `VALIDATION_ERROR` (422).
  - A regra vale para cada time. Quem saiu da lista (TIM-12) não conta.
  - _Por quê:_ contar só a principal deixa claro quem é "o levantador" do time. Se faltar um, o dono muda a principal de alguém só naquele jogo (TIM-13: "hoje o Fulano levanta"), e a regra passa a contar com ele. Combinações (ex.: "mulher levantadora") ficam para depois.
- **TIM-19. O sorteio cumpre as regras, ou não sorteia:** antes de sortear, a api confere se dá para cumprir todas as regras com as pessoas do sorteio (TIM-15), os fixados (TIM-16), a quantidade de times e os tamanhos. Se não der, nada muda e a resposta é `TEAM_RULES_CONFLICT` (422) com a lista do que impede:
  - **falta gente:** "1 levantador por time com 3 times precisa de 3, e o sorteio tem 2";
  - **sobra gente:** "no máximo 1 levantador por time com 2 times cabe 2, e o sorteio tem 3" (todo mundo do sorteio entra num time);
  - **fixados:** "o Time 1 tem 2 levantadores fixados, e o máximo é 1";
  - **times opostos com mais gente que times** (TIM-22): "Ana, Bia e Carla em times diferentes precisam de 3 times, e o jogo tem 2" (conta só quem está no sorteio);
  - **times opostos fixados juntos:** "Ana e Bia estão fixadas no Time 1";
  - **as regras não fecham juntas:** cada uma dá sozinha, mas não todas juntas com os fixados e os tamanhos (ex.: 4 pessoas em 2 times, os 2 levantadores fixados no Time 1, e "no mínimo 1 levantador" e "no mínimo 1 mulher" por time: o Time 1 já está cheio e fica sem mulher).
  - Os fixados contam para as regras do time em que estão. O sorteio guarda uma cópia das regras que usou (as de quantidade e as de times opostos).
  - _Por quê:_ regra obrigatória é obrigatória: um sorteio que "quase" cumpre cria a discussão que o módulo quer evitar. A lista do que falta diz ao dono o que mudar (a quantidade de times, um fixado, a principal de alguém no jogo ou a regra). Espalhar "o melhor possível" é preferência (TIM-23), e nunca vence uma regra.
  - _Alterada em 2026-11-12:_ os conflitos de times opostos.
- **TIM-20. Montar à mão com regras:** o dono vê, em cada time, o que está fora das regras ("falta 1 levantador", "passou 1 do máximo de mulheres", "Ana e Bia deviam estar em times diferentes"). Os outros não veem. A preferência de gênero (TIM-23) nunca aparece como fora das regras.
  - O rascunho salva sempre, mesmo fora das regras: montar à mão passa por times incompletos.
  - **Publicar** com algum time fora das regras depende da configuração (TIM-17): desligada, responde `TEAM_RULES_VIOLATED` (422, com o que está fora); ligada, publica.
  - Depois de publicados, as mudanças salvam sempre (a troca na hora, TIM-09), e a tela continua apontando o que ficou fora.
  - _Por quê:_ às vezes o dono sabe mais que a regra (faltou levantador e todo mundo topou), e cada grupo decide se aceita isso. Bloquear o rascunho impediria montar à mão.
  - _Alterada em 2026-11-12:_ times opostos também.
- **TIM-22. Times opostos:** "estas pessoas sempre em times diferentes", com 2 a 8 pessoas por regra (um par, ou um conjunto: cada uma num time diferente das outras).
  - Entra numa regra quem o dono pode classificar (TIM-04): membros, reservas e convidados da lista atual. Outra pessoa responde `TEAM_PLAYER_NOT_FOUND`. A regra fica guardada mesmo se a pessoa sair do grupo, como as posições.
  - Até 10 regras de times opostos, e a mesma pessoa pode estar em mais de uma (Ana × Bia e Ana × Carla). Pessoa repetida na mesma regra, ou fora desses limites, `VALIDATION_ERROR`.
  - A regra vale para quem está no sorteio (TIM-15). Quem não está no jogo (ou saiu da lista, TIM-12) não conta: a regra não bloqueia, só não tem efeito para essa pessoa.
  - Junto com as regras de quantidade (TIM-18): o sorteio cumpre todas (TIM-19), e montando à mão vale o TIM-20.
  - _Por quê:_ separa quem joga melhor (os dois mais fortes nunca juntos) sem precisar dar nota para ninguém, e também resolve "esses dois não se acertam no mesmo time". Avulsos não entram: eles existem só num jogo, e a regra é do grupo.
- **TIM-23. Preferência: espalhar homens e mulheres.** Ligada (TIM-17), o sorteio busca que a quantidade de homens seja a mais parecida possível entre os times (de um time para outro, no máximo 1 de diferença), e a de mulheres também.
  - É **preferência**: nunca quebra uma regra (TIM-19) nem move um fixado (TIM-16). Se as regras ou os fixados não deixam, o sorteio fica com o mais perto possível, sem conflito e sem aviso.
  - Conta o gênero do perfil (ou do avulso, TIM-24). Quem não informou não conta, e quem saiu da lista (TIM-12) também não, como nas regras (TIM-18).
  - Com ela ligada, cada time mostra quantos homens e quantas mulheres tem ("3 H · 3 M"), para todos que veem os times. Montando à mão, o dono vê os mesmos números, e nada bloqueia.
  - _Por quê:_ no vôlei misto, um time só de homens desequilibra o jogo, mas uma regra rígida ("no mínimo 2 mulheres") às vezes não fecha numa semana com poucas mulheres. A preferência faz o melhor com quem veio. Desligada por padrão, porque no grupo de um gênero só não faz diferença.
- **TIM-24. Avulso:** o dono põe nos times do jogo uma pessoa **sem conta**, que não está na lista: nome (1 a 40 caracteres), gênero (opcional) e posições do esporte (opcional, a primeira é a principal).
  - Existe **só naquele jogo**: fica nos times do jogo e some ao descartar os times (TIM-06). Não ocupa vaga, não aparece na lista do jogo (Escalação e Banco) e não recebe aviso.
  - Até 20 avulsos por jogo. Entra no sorteio como quem está dentro (TIM-15), conta para as regras de quantidade com a sua principal e o seu gênero (TIM-18), pode ser fixado (TIM-16) e não entra em times opostos (TIM-22).
  - O dono muda o nome, o gênero e as posições dele, ou o remove, enquanto pode mexer nos times (TIM-07, TIM-11). Todos que veem os times veem o nome dele, com a marca "avulso".
  - Fica **fora do ranking** (E4b) e não vira membro: se a pessoa criar conta depois, é outra pessoa para o app.
  - _Por quê:_ na quadra sempre aparece alguém que não tem o app (o amigo de alguém, quem completou o time), e ele precisa entrar no sorteio e nas regras como qualquer um. Pedir conta para isso travaria o jogo.

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
  - **dono, sem times:** "Sortear" (TIM-15) e "Montar à mão", que cria o rascunho com a quantidade padrão de times (TIM-17), vazios, e todos de dentro em "sem time";
  - **dono, com times:** cada time com o número de pessoas (e "3 H · 3 M" com a preferência de gênero ligada, TIM-23) e, em cada pessoa, o nome e a posição principal no jogo (TIM-13). Uma marca "Rascunho" ou "Publicado", "sem time: N" quando houver, a marca "saiu da lista" (TIM-12), a marca "avulso" (TIM-24), um alfinete em quem está fixo (TIM-16) e, abaixo do time, o que está fora das regras (TIM-20);
  - **avulso:** "+ Avulso" (junto de "Times: − 2 +") abre o painel de baixo com nome, gênero (Homem, Mulher, Não informar) e posições, e o avulso entra em "sem time". Tocar num avulso abre o painel de mover com "Editar avulso" e "Remover avulso";
  - **mover alguém:** o dono toca na pessoa e escolhe no painel de baixo: Time 1, Time 2..., Sem time ou, para quem veio do Banco, Tirar dos times. O mesmo painel tem "Fixar neste time" (TIM-16) e muda as posições só no jogo (TIM-13). Sem arrastar: tocar funciona igual no celular;
  - "Times: − 2 +" muda a quantidade. Ao diminuir, quem estava no time que sumiu vai para "sem time" (e deixa de ser fixo);
  - ações: "Sortear" (ou "Sortear de novo", quando já há alguém num time), Publicar (ou Voltar para rascunho) e, num menu "⋮", Descartar times, com confirmação. Sortear com os times publicados pede confirmação ("os times voltam para rascunho");
  - **sortear sem dar** (TIM-19): um aviso com a lista do que impede, e nada muda. Publicar fora das regras sem a permissão (TIM-20) mostra o que está fora;
  - _Alterada em 2026-11-11:_ antes não havia sortear nem fixar. _Alterada em 2026-11-12:_ quantidade padrão e regras; depois, avulsos e "H · M" por time;
  - **quem não é dono:** só os times publicados, sem ações, com o próprio time em destaque (com os avulsos marcados e "H · M" se a preferência estiver ligada). Sem times publicados, o card não aparece;
  - **convidado, pela página do link do jogo:** os times publicados, como os outros veem.
  - Grupo arquivado não tem jogo (GRP-37), então não tem card.
- **TIM-21. Card "Times" nos Ajustes do grupo** (só o dono, como os outros cards dos Ajustes):
  - a quantidade padrão de times ("− 2 +") e o interruptor "Permitir publicar times fora das regras";
  - a lista das regras, cada uma numa linha ("Levantador: 1 por time", "Mulheres: no mínimo 2 por time", "Líbero: no máximo 1 por time"), com "Adicionar regra";
  - tocar numa regra, ou em "Adicionar regra", abre o painel de baixo: posição ou gênero, mínimo e máximo (cada um pode ficar sem valor), Salvar e, numa regra que já existe, Remover. O que já tem regra não aparece para escolher de novo.
  - **Times opostos:** a lista das regras, cada uma com os nomes ("Ana × Bia", "Ana × Bia × Carla"), e "Adicionar times opostos". O painel de baixo mostra as pessoas que o dono pode classificar (TIM-04) para marcar de 2 a 8, Salvar e, numa que já existe, Remover. Quem saiu do grupo continua na regra, com o nome.
  - O interruptor **"Espalhar homens e mulheres"** (TIM-23).
  - _Alterada em 2026-11-12:_ times opostos e a preferência de gênero.
  - _Por quê:_ as regras são do grupo, então ficam junto das outras configurações do grupo.

## 3. Como funciona

### Dados (single-table, sem GSI, ver [`dynamodb.md`](../../.claude/rules/dynamodb.md))

| Item                  | Chave                                | Para quê                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Jogador no grupo      | `PLAYER#<groupId>#<userId>` / `META` | `positions`, na ordem (a primeira é a principal, TIM-02). Entidade de relação com chave natural ([ADR 0009](../decisions/0009-entidade-de-relacao-chave-natural.md)), separada da participação para valer também para convidados (TIM-01)                                                                                                                                                                                                        |
| Times do jogo         | `TEAMS#<groupId>#<data>` / `META`    | `status` (`draft`/`published`), `teams` (ids por time, na ordem), `positions` (só os ajustes do jogo, TIM-13), `pinned` (ids de quem está fixo, TIM-16), `publishedAt` (a 1ª publicação, TIM-10). `rules` e `apart` (a cópia das regras do último sorteio, TIM-19). `extras` (os avulsos do jogo: id, nome, gênero, posições, TIM-24). Chave natural pelo jogo (grupo + data, como o `LOOKUP#GAME`), sem depender de o jogo já ter item (GRP-10) |
| Configuração de times | `TEAM_SETTINGS#<groupId>` / `META`   | `teamCount`, `rules` (posição ou gênero, mínimo, máximo), `apart` (ids de cada regra de times opostos, TIM-22), `spreadGender` (TIM-23), `allowOutsideRules` (TIM-17). Sem item, vale o padrão (2 times, sem regras, não espalha, não permite)                                                                                                                                                                                                   |

Não há lookup: quem aparece na lista já vem dos membros e do jogo atual (módulo de grupos), e as chaves se montam pelo par ou pela data.

### Onde está cada regra

| Arquivo                             | O que tem                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `contracts/src/teams.ts`            | posições e o catálogo de posições por esporte (TIM-02)                                         |
| `api/.../teams/player.service.ts`   | permissão e quem pode ser classificado (TIM-02, 03, 04)                                        |
| `api/.../teams/teams.service.ts`    | times do jogo: montar, publicar, aviso, prazo, quem saiu, sortear, regras, avulsos (TIM-06–24) |
| `api/.../teams/engine/draw.ts`      | sorteio puro: fixados, tamanhos, regras, preferência de gênero (TIM-15, 16, 19, 23)            |
| `api/.../teams/engine/rules.ts`     | contar, conferir antes de sortear e apontar o que está fora (TIM-18–20, 22)                    |
| `api/.../teams/settings.service.ts` | configuração de times do grupo (TIM-17, 18, 22, 23)                                            |

### Rotas

| Rota                                                         | Quem                  | Regras                                  |
| ------------------------------------------------------------ | --------------------- | --------------------------------------- |
| `GET /groups/{id}/players`                                   | membros e reservas    | TIM-01–04                               |
| `PUT /groups/{id}/players/{userId}`                          | dono                  | TIM-02–04                               |
| `GET /groups/{id}/games/{date}/teams`                        | membros e reservas    | TIM-06, 09, 12, 13                      |
| `PUT /groups/{id}/games/{date}/teams`                        | dono                  | TIM-06–08, 11, 13, 16, 24               |
| `POST /groups/{id}/games/{date}/teams/publish`, `/unpublish` | dono                  | TIM-08–11, 20                           |
| `POST /groups/{id}/games/{date}/teams/draw`                  | dono                  | TIM-11, 15, 16, 19                      |
| `GET /groups/{id}/team-settings`, `PUT`                      | dono                  | TIM-17, 18, 22, 23                      |
| `DELETE /groups/{id}/games/{date}/teams`                     | dono                  | TIM-06, 11                              |
| `GET /play/{token}/teams`                                    | logado (link do jogo) | TIM-09: só os times publicados (GRP-09) |

O `GET /players` devolve todos os membros, reservas e convidados da lista atual, cada um com as suas posições. O `PUT /players` recebe `{ positions }` (a primeira é a principal) e devolve o jogador.

O `GET /teams` devolve os times (ou que não há times), com cada pessoa marcada se saiu da lista e as posições valendo no jogo. Para o dono, também o que está fora das regras em cada time (TIM-20). O `PUT /teams` recebe `{ teams, positions, pinned, extras }` (os avulsos inteiros, TIM-24) e salva sem mudar o estado (rascunho continua rascunho, publicado continua publicado).

O `PUT /team-settings` recebe a configuração inteira (`{ teamCount, rules, apart, spreadGender, allowOutsideRules }`) e a devolve, com o nome de cada pessoa dos times opostos.

Erros: `TEAM_PLAYER_NOT_FOUND`, `TEAM_POSITION_INVALID`, `TEAM_EMPTY`, `TEAM_RULES_CONFLICT` (`details.conflicts`), `TEAM_RULES_VIOLATED` (`details.violations`), e os do grupo (`GROUP_NOT_FOUND`, `GROUP_NOT_OWNER`, `GROUP_ARCHIVED`, `GAME_NOT_FOUND`, `GAME_CANCELLED`).

## 4. Limites conhecidos

- A lista de jogadores é carregada junto com a página. Um convidado que confirma depois só pode ser classificado quando a página recarrega (qualquer ação do dono recarrega).
- O dono não tem uma lista dos convidados de semanas passadas: só classifica um convidado enquanto ele está na lista do jogo atual (TIM-04).
- Os times de um jogo que terminou ficam guardados, mas ninguém vê (não há histórico, GRP-11). As partidas (E4a) vão usá-los.
- Se o dono mexer nos times em dois aparelhos ao mesmo tempo, vale o último que salvou.
- As regras contam só a posição principal no jogo. Se o Fulano é ponteiro e às vezes levanta, ele só conta como levantador quando o dono muda a principal dele no jogo (TIM-13).
- O avulso não tem histórico: na semana seguinte, o dono cadastra de novo (nome, gênero, posições).
- A preferência de gênero não garante o melhor equilíbrio possível: o sorteio busca com um limite de passos, e na prática chega na diferença de no máximo 1 quando as regras deixam.
- O sorteio procura uma divisão que cumpra as regras com um limite de tentativas. Num caso muito apertado (muitas regras, pouca folga), pode responder que as regras não fecham juntas mesmo existindo uma divisão; na prática, com até 50 pessoas e 10 regras, não acontece.

## 5. Em discussão (ainda não é regra)

Roteiro aprovado em 2026-11-10, em 6 etapas que o dono testou no app uma a uma: todas já são regra (seção 2).

Decidido: as regras são do grupo, e todo jogo segue as regras do grupo (o sorteio guarda uma cópia das que usou). Fixar uma pessoa num time é uma ação manual no jogo, não uma regra.

Fora por enquanto (2026-11-11): **nível técnico**. O dono achou subjetivo demais para o dono classificar à mão. Volta quando houver um critério melhor, como o nível calculado pelos resultados (E6). O motor fica pronto para uma preferência nova desse tipo.

Contar também as outras posições da pessoa (não só a principal) numa regra, e regras que combinam posição e gênero: depois, se o dono pedir.

Posição em cada partida (e não só no jogo): só se precisar, quando as partidas existirem (E4a).

Depois da E3: espalhar uma posição sem mínimo, manter pessoas juntas e a ligação com as partidas da E4a (o sorteio pode ter mais de 2 times, e cada partida usa 2 deles).
