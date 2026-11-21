# Módulo Grupos (v2)

> **Documento vivo.** Descreve como o módulo funciona **hoje** e por quê. Toda mudança no módulo começa aqui: primeiro muda a regra neste arquivo, depois o código. Conferido com o código em 2026-11-21.

Código: `apps/scorely/api/src/modules/groups-v2/`, `apps/scorely/web/src/modules/groups-v2/`. Contrato: `apps/scorely/contracts/src/groups-v2.ts`.

O grupo novo, escrito do zero ao lado do antigo ([grupos.md](grupos.md)), que continua no ar até a troca ([ADR 0017](../decisions/0017-grupo-v2-lado-a-lado.md)).

> **Grupo aberto e pedidos ainda não estão no ar.** As regras marcadas com _(etapa C)_ (GRV-25 a 28, 38, 39 e as partes de GRV-14 e 32) foram aprovadas em 2026-11-21 e entram na próxima etapa. Até lá, só se entra por convite.

## 1. Para que serve

Juntar as pessoas que jogam juntas, de qualquer atividade, do mesmo jeito. O grupo é quem participa (membros e reservas), o nome, o logo e a capa: a agenda das partidas e os campeonatos entram depois, cada um no seu módulo. **O grupo não tem times:** ele tem membros, e quem tem times é a partida.

Caso de referência: a Ana cria a "Pelada de sexta" e é a dona dela. Ela manda um convite no WhatsApp para os amigos de sempre, que entram como membros, e um convite de reserva, com 5 usos, para quem joga quando falta gente.

| Termo           | Significado                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Grupo           | um nome e as pessoas que participam dele                                                                         |
| Participação    | como a pessoa está no grupo (`myTier`): `member` (membro) ou `reserve` (reserva) (GRV-17)                        |
| Membro          | quem participa com prioridade. O dono é sempre membro                                                            |
| Reserva         | quem participa, vê o mesmo que o membro, e vem depois dele nos jogos (quando houver agenda)                      |
| Cargo           | o que a pessoa administra (`myRole`). Por enquanto, dois fixos: `owner` (Dono) e `member` (o cargo base, GRV-15) |
| Dono            | quem criou o grupo. Há um só, e ele participa como membro                                                        |
| Permissão       | uma ação de administração, como `members.invite` (GRV-15)                                                        |
| Convite         | um link `/v2/join/<token>` com regras: validade, limite de usos, para quem e como entra (GRV-18)                 |
| Modo de entrada | `invite` (só por convite, o padrão) ou `open` (também por pedido) (GRV-25)                                       |
| Pedido          | o pedido de alguém de fora para entrar num grupo aberto (GRV-27)                                                 |
| Id público      | o código curto do grupo (ex.: `K3X9PQ2A`), o único que vai na URL e na api (GRV-08)                              |
| Logo            | a imagem quadrada que identifica o grupo (512×512, GRV-09)                                                       |
| Capa            | a imagem larga do topo do grupo (1600×600, GRV-09)                                                               |

## 2. Regras de negócio

### Criar

- **GRV-01. Criar o grupo pede só o nome** (`POST /v2/groups` `{ name }`): de 1 a 80 caracteres, sem os espaços das pontas. Vazio ou maior que 80 responde `VALIDATION_ERROR` (422). O grupo não tem esporte, horário, lugar nem fuso. Ele nasce sem logo e sem capa, que entram depois, pelas Configurações do grupo (GRV-09, 12). _(Alterada em 2026-11-20: antes, o grupo não tinha logo nem capa.)_
  - _Por quê:_ o grupo serve para qualquer atividade do mesmo jeito. O esporte vai ser só um filtro, quando houver um marketplace, e o que é do jogo (dia, hora, lugar, vagas) fica na agenda. A imagem fica fora da criação para criar continuar sendo um campo só: o envio tem dois passos (MID-04, 05) e pode falhar sem impedir o grupo de existir.
- **GRV-02. Quem cria é o dono e participa do grupo.** O grupo nasce com uma participação só, a de quem criou, como membro e com o cargo `owner`. O grupo nasce no modo de convite (GRV-25). _(Alterada em 2026-11-21: entraram a participação de membro e o modo de entrada.)_
  - _Por quê:_ alguém responde pelo grupo desde o primeiro instante, e é a partir da participação que vêm os membros e o gerenciamento deles.
- **GRV-03. O nome pode repetir,** inclusive entre os grupos da mesma pessoa. Quem identifica o grupo é o `id`.
  - _Por quê:_ "Pelada de sexta" é comum, e barrar o nome repetido não protege nada.

### Identificação

- **GRV-08. O grupo tem um id público curto, e é o único que sai do sistema.** São 8 caracteres em Crockford base32 (ex.: `K3X9PQ2A`), gerados ao criar, únicos. A URL (`/v2/groups/K3X9PQ2A`), as rotas e as respostas usam só ele (o `id` do grupo na resposta é o público). O id do sistema (uuid) fica no banco: é a chave do grupo e de tudo o que é dele.
  - O id público não é convite: saber o código não dá acesso ao grupo (GRV-04). Cada convite tem um token próprio (GRV-18).
  - _Por quê:_ a URL fica curta e fácil de compartilhar. Como as chaves do banco não dependem do código, ele pode mudar depois (por exemplo, um endereço escolhido no marketplace) trocando só o lookup, como o id público do usuário ([ADR 0011](../decisions/0011-id-publico-do-usuario.md)). Separar o convite evita que um print da URL deixe alguém entrar, e que cancelar um convite quebre os links salvos.

### Ver

- **GRV-04. Só quem participa vê o grupo** (`GET /v2/groups/{publicId}`). Para quem não participa, ou para um código que não existe, a resposta é `GROUP_NOT_FOUND` (404). O grupo vem com a participação (`myTier`), o cargo (`myRole`) e as permissões (`myPermissions`, GRV-16) de quem pede. Quem é de fora vê só a apresentação: pelo convite (GRV-21) ou, num grupo aberto, pelo código (GRV-26). _(Alterada em 2026-11-21: entraram a participação, as permissões e a apresentação.)_
  - _Por quê:_ quem não participa não fica sabendo que o grupo existe, a não ser que o grupo queira (o convite, o modo aberto).
- **GRV-05. Meus grupos** (`GET /v2/me/groups`): os grupos de que a pessoa participa, como membro ou reserva, em ordem de nome (sem diferenciar maiúsculas e acentos), cada um com o `myTier`, o `myRole` e o `myPermissions`. Sem nenhum grupo, a lista vem vazia. _(Alterada em 2026-11-21: entraram a participação e as permissões.)_
  - _Por quê:_ sem a agenda, não há "próximo jogo" para ordenar. Pelo nome, o grupo é fácil de achar.

### Permissões

- **GRV-15. Toda ação de administração é conferida por uma permissão, numa função só** ("pode X neste grupo?"). O catálogo de hoje:

  | Permissão        | Libera                                                                                           |
  | ---------------- | ------------------------------------------------------------------------------------------------ |
  | `group.edit`     | logo e capa (GRV-09) e o modo de entrada (GRV-25)                                                |
  | `members.invite` | criar, ver e cancelar os convites do grupo (GRV-18–20, 23) e aceitar ou recusar pedidos (GRV-28) |
  | `members.remove` | remover alguém do grupo (GRV-31)                                                                 |
  - Por enquanto, o cargo Dono tem todas e o cargo base (`member`), nenhuma. Os cargos (seção 5) vão mudar só a resposta da função, e não as regras.
  - A reserva tem o cargo base, como o membro: participação e cargo são coisas diferentes.
  - Quem participa e não tem a permissão recebe `GROUP_PERMISSION_DENIED` (403 com corpo, `details.permission`). Quem não participa recebe `GROUP_NOT_FOUND` antes, como em GRV-04.
  - O que não é administração não é permissão: ver o grupo e os membros, entrar e sair. Ninguém tira isso de quem participa.
  - _Por quê:_ com uma função só, os cargos entram sem mexer em cada ação. Separar convidar de remover permite, depois, que todo membro convide sem poder tirar ninguém.

- **GRV-16. O grupo diz o que cada pessoa pode fazer:** `myPermissions` vem no grupo (GRV-04, 05) com as permissões de quem pede. A tela só mostra as ações que a pessoa pode fazer, e a api confere de novo a cada ação (GRV-15).
  - _Por quê:_ a tela não precisa saber quem é dono para decidir o que mostrar; quando vierem os cargos, ela não muda.

### Participação

- **GRV-17. Quem participa é membro ou reserva.** Os dois veem o mesmo: o grupo, os membros e as reservas. A diferença é a prioridade nos jogos, que entra com a agenda (seção 5).
  - A reserva vira membro por um convite de membro feito para ela (GRV-22, 23), e não sozinha.
  - Ninguém é rebaixado por entrar: um membro que usa um convite de reserva continua membro (GRV-22).
  - _Por quê:_ todo grupo tem os de sempre e os que completam quando falta gente. Subir para membro pelo convite deixa a pessoa aceitar, em vez de ser mudada sem saber.

### Convites

- **GRV-18. Quem tem `members.invite` cria convites** (`POST /v2/groups/{publicId}/invites`). O grupo pode ter vários ao mesmo tempo, cada um com um link próprio (`/v2/join/<token>`, com um token aleatório) e as suas regras:

  | Regra          | Valores                                                                              | Padrão          |
  | -------------- | ------------------------------------------------------------------------------------ | --------------- |
  | Entra como     | `member` ou `reserve`                                                                | `member`        |
  | Validade       | 1, 7 ou 30 dias, ou sem prazo                                                        | 7 dias          |
  | Limite de usos | de 1 a 100, ou sem limite                                                            | sem limite      |
  | Para quem      | qualquer pessoa com o link, ou uma pessoa só, pelo id público ou pelo email (GRV-23) | qualquer pessoa |
  - O convite guarda quem criou e quando.
  - O grupo tem no máximo **50 convites ativos**. O 51º responde `GROUP_INVITE_LIMIT` (409, `details.limit`).
  - _Por quê:_ o convite aberto no grupo do WhatsApp, o convite de reserva com poucos usos e o convite para uma pessoa só são situações diferentes, e cada uma pede a sua regra. O padrão de 7 dias faz o link esquecido parar de valer sozinho. O limite de ativos evita que o grupo acumule portas abertas sem ninguém saber.

- **GRV-19. Quem tem `members.invite` vê os convites do grupo** (`GET /v2/groups/{publicId}/invites`), do mais novo para o mais antigo. Cada um vem com o link, as regras, quem criou (perfil: id público, apelido e foto), os usos ("3 de 10"), quem entrou por ele (perfis) e a situação:

  | Situação    | Quando                                                                  |
  | ----------- | ----------------------------------------------------------------------- |
  | `active`    | vale: dentro da validade, com usos sobrando, não cancelado nem recusado |
  | `expired`   | passou da validade                                                      |
  | `exhausted` | chegou ao limite de usos                                                |
  | `revoked`   | alguém cancelou (GRV-20)                                                |
  | `declined`  | a pessoa para quem era recusou (GRV-24)                                 |
  - O convite que deixou de valer continua na lista por 30 dias e depois some.
  - Todos com `members.invite` veem e cancelam todos os convites, com o nome de quem criou. Quando vierem os cargos, cada um só mexe nos convites de quem está abaixo do próprio cargo.
  - _Por quê:_ quem administra precisa saber quais portas estão abertas, quem abriu e quem passou por elas. Os 30 dias deixam ver o que acabou de vencer sem a lista crescer para sempre.

- **GRV-20. Cancelar um convite** (`DELETE /v2/groups/{publicId}/invites/{inviteId}`) faz o link parar de valer na hora. Ele fica na lista como `revoked`. Cancelar um convite que já não vale não muda nada.
  - _Por quê:_ fechar uma porta não pode quebrar as outras: cada convite cancela sozinho.
- **GRV-21. Qualquer pessoa logada que abre um convite que vale vê a apresentação do grupo** (`GET /v2/invites/{token}`): o id público, o nome, o logo, a capa, o número de participantes, como ela vai entrar (membro ou reserva) e como ela já participa, se participa.
  - Um convite que não vale responde `GROUP_INVITE_INVALID` (404), com o motivo em `details.reason`: `not_found`, `expired`, `exhausted`, `revoked` ou `declined`.
  - Um convite para outra pessoa responde `GROUP_INVITE_NOT_FOR_YOU` (403), sem mostrar o grupo nem para quem é.
  - _Por quê:_ a pessoa sabe onde está entrando antes de entrar, e o motivo deixa a tela dizer "este convite venceu, peça outro" em vez de um erro genérico. Os membros, com nome e foto, ficam só para quem entrou.
- **GRV-22. Entrar por um convite** (`POST /v2/invites/{token}/join`) responde o grupo (GRV-04) e depende de como a pessoa está:

  | Hoje a pessoa | Convite de membro | Convite de reserva |
  | ------------- | ----------------- | ------------------ |
  | não participa | entra como membro | entra como reserva |
  | é reserva     | vira membro       | nada muda          |
  | é membro      | nada muda         | nada muda          |
  - Só o que muda alguma coisa gasta um uso. A data de entrada é a do primeiro dia e não muda quando a reserva vira membro.
  - A participação guarda por qual convite a pessoa entrou ou subiu (GRV-29).
  - Se a pessoa tinha um pedido esperando (GRV-27), ele some na mesma operação.
  - O uso é contado dentro da própria gravação: duas pessoas entrando no último uso ao mesmo tempo nunca passam do limite. A segunda recebe `GROUP_INVITE_INVALID` com `exhausted`.
  - _Por quê:_ abrir o convite duas vezes, ou o dono abrir o próprio convite, não pode dar erro, gastar uso nem rebaixar ninguém.

- **GRV-23. O convite para uma pessoa só** vale para ela e para mais ninguém, e tem sempre 1 uso.
  - **Pelo id público:** a pessoa precisa existir (senão, `USER_NOT_FOUND`, 404). Ela recebe o aviso `group_invited`, com o link do convite.
  - **Pelo email:** a pessoa entra estando logada com aquele email (o login é por código no email, então o email está confirmado). O email é guardado normalizado (minúsculas, sem espaços). Se já existe uma conta com ele, ela recebe o mesmo aviso; senão, o convite aparece quando ela criar a conta (GRV-24). O app ainda não manda email: quem cria copia o link e manda como quiser.
  - Convidar quem já participa e não subiria com o convite (um membro, ou uma reserva para reserva) responde `VALIDATION_ERROR`.
  - O email só aparece na lista de convites (GRV-19), para quem tem `members.invite`. A apresentação e os erros nunca mostram para quem é o convite.
  - _Por quê:_ o convite pessoal é o jeito de chamar alguém específico, inclusive uma reserva para virar membro, sem que o link repassado sirva para outra pessoa. O aviso no app evita depender do WhatsApp para quem já tem conta.
- **GRV-24. Convites para mim** (`GET /v2/me/group-invites`): os convites que valem feitos para a pessoa, pelo id público ou pelo email dela, do mais novo para o mais antigo, com a apresentação de cada grupo (GRV-21) e quem convidou.
  - Entrar é a GRV-22. Recusar (`DELETE /v2/me/group-invites/{inviteId}`) deixa o convite como `declined`, sem aviso para quem convidou: ele vê na lista de convites (GRV-19).
  - _Por quê:_ quem recebeu um convite pessoal acha ele no app, sem precisar do link, e pode dizer não sem constrangimento.

### Grupo aberto _(etapa C)_

- **GRV-25. O grupo tem um modo de entrada:** `invite` (o padrão, ao criar), em que só se entra por convite, ou `open`, em que também se entra por um pedido aceito (GRV-27). Quem tem `group.edit` muda o modo (`PUT /v2/groups/{publicId}/join-mode` `{ mode, expectedVersion }`), com a `version` conferida ([ADR 0016](../decisions/0016-version-confere-nas-edicoes.md)). Os convites funcionam nos dois modos.
  - Voltar para `invite` com pedidos esperando não apaga os pedidos: eles continuam para aceitar ou recusar (GRV-28), mas ninguém pede de novo.
  - _Por quê:_ a maioria dos grupos é fechada (os amigos de sempre), por isso o convite é o padrão. O modo aberto prepara o grupo para ser achado (o marketplace) sem perder o controle de quem entra.
- **GRV-26. No grupo aberto, quem é de fora vê a apresentação pelo código** (`GET /v2/groups/{publicId}/preview`): o id público, o nome, o logo, a capa, o número de participantes e, se a pessoa tem um pedido esperando, a data dele. No grupo de convite, a resposta é `GROUP_NOT_FOUND`, como em GRV-04.
  - _Por quê:_ o grupo aberto quer ser achado, e o código na URL é o jeito de compartilhar sem um convite de entrada direta.
- **GRV-27. No grupo aberto, quem é de fora pede para entrar** (`POST /v2/groups/{publicId}/requests`). No grupo de convite, a resposta é `GROUP_NOT_FOUND`.
  - Pedir de novo com um pedido esperando não muda nada. Quem já participa recebe `VALIDATION_ERROR`.
  - Quem tem `members.invite` recebe o aviso `group_join_requested`, com o link para os Membros do grupo.
  - A pessoa cancela o próprio pedido (`DELETE /v2/groups/{publicId}/requests/me`), em qualquer modo. Sem pedido, nada muda.
  - _Por quê:_ quem pede espera a resposta sem ficar mandando de novo, e pode desistir.
- **GRV-28. Quem tem `members.invite` vê, aceita e recusa os pedidos** (`GET /v2/groups/{publicId}/requests`, do mais antigo para o mais novo, com o perfil de cada pessoa).
  - Aceitar (`POST /v2/groups/{publicId}/requests/{userPublicId}/approve` `{ tier }`) faz a pessoa participar como membro ou como reserva, quem aceita escolhe, e apaga o pedido, numa operação só. Ela recebe o aviso `group_join_approved`, com o link do grupo. Se ela já tinha entrado por um convite, só o pedido some.
  - Recusar (`DELETE /v2/groups/{publicId}/requests/{userPublicId}`) apaga o pedido, sem aviso. A pessoa pode pedir de novo.
  - Um pedido que não existe mais (cancelado, recusado ou aceito por outra pessoa) responde `GROUP_REQUEST_NOT_FOUND` (404).
  - _Por quê:_ quem aceita conhece a pessoa e decide se ela é dos de sempre ou dos que completam. Recusar sem aviso evita o constrangimento num grupo de amigos.

### Membros

- **GRV-29. Quem participa vê os membros e as reservas** (`GET /v2/groups/{publicId}/members`): o perfil de cada pessoa (id público, apelido e foto, sem email nem nome, USR-13), a participação, o cargo, a data de entrada e quem a convidou (o perfil de quem criou o convite pelo qual ela entrou ou subiu, quando houver). Primeiro o dono, depois os membros e por último as reservas; dentro de cada um, pela data de entrada, do mais antigo para o mais novo.
  - Quem convidou fica guardado na participação, ao entrar ou subir: continua aparecendo depois que o convite some da lista (GRV-19). _(Alterada em 2026-11-21: antes, vinha do convite e sumia 30 dias depois de ele deixar de valer.)_
  - Para quem tem `members.invite`, cada pessoa vem também com o id do convite pelo qual entrou ou subiu (GRV-37).
  - _Por quê:_ quem joga junto precisa saber quem é do grupo e quem trouxe quem, e isso não vence com o convite. A data de entrada dá a ordem que não muda quando alguém troca de apelido.
- **GRV-30. Quem participa sai do grupo sozinho** (`DELETE /v2/groups/{publicId}/members/me`). A participação some na hora, e o grupo sai dos grupos da pessoa (GRV-05). O dono não sai (`GROUP_OWNER_NOT_REMOVABLE`, 409): para isso, ele vai passar o grupo para outra pessoa, que vem com os cargos (seção 5).
  - Quem saiu pode voltar por um convite (GRV-22) ou por um pedido (GRV-27), como alguém novo.
  - _Por quê:_ ninguém fica preso num grupo. O grupo nunca fica sem alguém que responde por ele.
- **GRV-31. Quem tem `members.remove` remove alguém do grupo** (`DELETE /v2/groups/{publicId}/members/{userPublicId}`), membro ou reserva, com o mesmo efeito de sair (GRV-30). A pessoa removida não é avisada.
  - Ninguém remove o dono (`GROUP_OWNER_NOT_REMOVABLE`). Remover a si mesmo responde `VALIDATION_ERROR`: para isso existe sair. Quem não participa responde `GROUP_MEMBER_NOT_FOUND` (404).
  - Os convites não mudam sozinhos: a tela oferece cancelar o convite pelo qual a pessoa entrou, se ele ainda vale (GRV-37).
  - _Por quê:_ cancelar sozinho fecharia a porta para todos os outros que usam o mesmo convite. Quem remove decide. Quando vierem os cargos, só se remove quem está abaixo do próprio cargo; hoje, isso é "o dono remove os outros".

### Logo e capa

- **GRV-09. Só quem tem `group.edit` (GRV-15) troca e remove o logo e a capa do grupo.** São as mídias de finalidade `group.logo` (512×512) e `group.cover` (1600×600), as duas até 2 MB e públicas (MID-02 em [midia.md](midia.md)). O envio, a conferência, a troca e a remoção seguem as regras da mídia (MID-03 a MID-11), pelas rotas `/v2/groups/{publicId}/images/{slot}`, com `slot` = `logo` ou `cover`. _(Alterada em 2026-11-21: antes, só o dono, com `GROUP_NOT_OWNER`.)_
  - Quem não participa, ou um código que não existe, recebe `GROUP_NOT_FOUND` (404), como em GRV-04. Quem participa e não tem a permissão recebe `GROUP_PERMISSION_DENIED` (403).
  - A permissão é conferida nos dois passos, ao pedir o envio e ao confirmar (MID-01).
  - Trocar e remover não mandam a `version`: somam 1 nela e gravam o `updatedAt` ([ADR 0013](../decisions/0013-version-e-updatedat.md)), sem conferir. Confirmar de novo a mesma imagem não muda nada (MID-07).
  - _Por quê:_ o logo e a capa identificam o grupo para todos, então quem decide é quem responde por ele (GRV-02) ou quem ele liberar (GRV-15). Sem versão, duas trocas ao mesmo tempo não dão erro: a mídia já garante que só uma vale (MID-08), e não há nada digitado na tela para perder.
- **GRV-10. Todos que veem o grupo veem o logo e a capa:** o grupo vem com `logoUrl` e `coverUrl` (cada um só quando existe) em todas as respostas (GRV-04, 05, a apresentação e as rotas de imagem). A URL é montada na resposta a partir do id da mídia (MID-12) e não leva o id do sistema do grupo.

### Telas (web)

- **GRV-06. A tela `/v2/groups` lista os meus grupos** (GRV-05) em cards de capa: a capa em cima, o logo sobreposto na borda de baixo dela e o nome embaixo. Um card por linha no celular e em grade no desktop. Acima dos grupos, quando há, vem a seção **Convites para você** (GRV-36). Sem grupo e sem convite, mostra só o botão "Criar grupo". _(Alterada em 2026-11-20: antes, o card tinha só o nome. Alterada em 2026-11-21: entraram os convites para você.)_
- **GRV-07. Criar grupo é um painel de baixo, por cima da lista,** só com o campo do nome. Ao criar, o painel fecha e a pessoa vai para a página do grupo (`/v2/groups/{publicId}`), que mostra a capa, o logo e o nome no topo. _(Alterada em 2026-11-20: antes, a página mostrava só o nome.)_
- **GRV-11. Sem logo ou sem capa, o lugar da imagem usa uma cor fixa calculada do id público do grupo,** e o logo mostra as iniciais do nome (a primeira letra da primeira e da última palavra).
  - _Por quê:_ o grupo recém-criado não tem imagem, e a tela não pode parecer quebrada. A cor do id é a mesma em todo lugar e diferencia grupos de nome parecido.
- **GRV-12. Quem tem `group.edit` troca as imagens em Configurações** (GRV-14). A linha "Logo e capa" abre um painel de baixo com a miniatura de cada uma e os botões Trocar e Remover (Remover só quando há imagem). Escolhido o arquivo, o navegador prepara a imagem (MID-03) e envia; ao confirmar, a miniatura e o topo do grupo já mostram a imagem nova. Uma imagem reprovada mostra a mensagem do `MEDIA_INVALID`. _(Alterada em 2026-11-20: antes, o botão "Logo e capa" ficava no topo da página do grupo. Alterada em 2026-11-21: antes, só o dono.)_
  - _Por quê:_ trocar a imagem é configurar o grupo, coisa rara. No topo, o botão disputava espaço com o nome e aparecia para quem só quer ver o grupo.
- **GRV-13. Dentro do grupo, as áreas ficam numa barra de navegação:** embaixo da tela no celular e numa coluna à esquerda do conteúdo no PC (a partir de 1024 px, o mesmo ponto em que o menu do app fica fixo). Cada área tem ícone e nome e a sua rota:
  - **Início** (`/v2/groups/{publicId}`): a capa, o logo e o nome em destaque (GRV-07). É a área que abre ao entrar no grupo.
  - **Membros** (`/v2/groups/{publicId}/members`): para todos que participam (GRV-32). _(Nova em 2026-11-21.)_
  - **Configurações** (`/v2/groups/{publicId}/settings`): só para quem tem `group.edit` (GRV-14, 16). Para os outros, a área não aparece, e a rota leva ao Início. _(Alterada em 2026-11-21: antes, só para o dono.)_
  - **Partidas** entra na barra junto com a sua etapa (seção 5), não antes.
  - Trocar de área troca a tela sem empilhar no histórico: o voltar do navegador sai do grupo, e não volta para a área anterior. Fora do Início, o topo é compacto: o logo pequeno e o nome.
  - _Por quê:_ abas no topo, como no grupo antigo, ficam apertadas no celular e somem ao rolar. A barra de baixo fica no alcance do polegar e sempre à vista, o padrão dos apps no celular (até 5 áreas); no PC, a coluna usa a largura que sobra. A área sem conteúdo fica fora para a tela não prometer o que ainda não existe. Sem empilhar, o voltar faz o que se espera de uma barra de app.
  - _(Alterada em 2026-11-21: saiu "com uma área só, a barra não aparece", que deixou de acontecer com os Membros para todos.)_
- **GRV-14. Configurações é uma lista agrupada:** cada linha tem ícone, nome, o valor atual quando há (ex.: o nome do grupo) e a seta, e tocar abre o painel de baixo da configuração. Por enquanto há dois grupos: **Identidade**, com a linha "Logo e capa" (GRV-12), e **Entrada**, com a linha "Quem pode entrar" (GRV-38, _etapa C_). As próximas (nome, arquivar) entram na lista quando existirem. _(Alterada em 2026-11-21: entrou o grupo Entrada.)_
  - _Por quê:_ a lista cresce sem mudar a tela, e cada edição segue o padrão de painel de baixo do app.
- **GRV-32. A tela Membros** (GRV-29) tem duas seções, **Membros** e **Reservas** (esta só quando há reserva). Cada linha mostra a foto, o apelido, a marca "Dono" quando é o caso, a data de entrada e "convidado por" quem trouxe a pessoa.
  - Para quem tem `members.invite`: no topo, o botão **Convidar** (GRV-33) e a linha **Convites**, com o número de ativos, que abre a lista (GRV-34); quando há pedidos, a seção **Pedidos** antes das outras, com Aceitar (escolhendo membro ou reserva) e Recusar (GRV-28, _etapa C_); e, no menu da linha de cada reserva, **Convidar para membro**, que cria um convite pessoal de membro para ela, com o padrão de validade (GRV-23).
  - Para quem tem `members.remove`: o menu de cada linha (menos a do dono e a própria) tem **Remover**, com confirmação (GRV-31, 37).
  - No fim da tela, **Sair do grupo**, com confirmação (GRV-30). Não aparece para o dono. Ao sair, a pessoa vai para os seus grupos.
  - _Por quê:_ tudo o que é sobre as pessoas fica num lugar só, e quem só joga vê só a lista e o sair.
- **GRV-33. Convidar abre um painel de baixo para criar o convite** (GRV-18): **Para quem** (qualquer pessoa com o link, ou uma pessoa, pelo id público ou pelo email), **Entra como** (membro ou reserva), **Validade** (1, 7 ou 30 dias, ou sem prazo) e **Limite de usos** (1, 5, 10, 25 ou sem limite; some quando é para uma pessoa). Os valores já vêm no padrão: criar um convite comum é um toque. Criado, o painel mostra o link com **Copiar** e **Compartilhar** (o compartilhar do celular, quando o navegador tem).
  - _Por quê:_ o caso comum (um link para o WhatsApp) não pode pedir quatro decisões; as regras ficam à mão para quando importam.
- **GRV-34. A lista de convites** (`/v2/groups/{publicId}/invites`) mostra um cartão por convite (GRV-19): a situação, as regras em uma linha ("Membro · 7 dias · 3 de 10 usos", ou "Reserva · para @apelido"), quem criou e quando, e quem entrou por ele. Os ativos vêm primeiro. Cada ativo tem **Copiar**, **Compartilhar** e **Cancelar**, com confirmação (GRV-20).
- **GRV-35. A página do convite** (`/v2/join/{token}`) mostra a apresentação do grupo (GRV-21): a capa, o logo, o nome, o número de participantes e "Você vai entrar como membro" (ou reserva), com o botão **Entrar**. Quem já participa e não subiria vê **Abrir o grupo**; a reserva com um convite de membro vê **Virar membro**. Sem login, a pessoa passa pelo login e volta para a página. Um convite que não vale mostra uma mensagem pelo motivo (venceu, esgotou, foi cancelado, não existe, é para outra pessoa).
  - Ao entrar, a pessoa vai para a página do grupo (GRV-07).
- **GRV-36. Convites para você** (GRV-24), na tela dos meus grupos: um cartão por convite, com o logo e o nome do grupo, quem convidou e como a pessoa entra, com **Entrar** e **Recusar**.
- **GRV-37. Depois de remover alguém que entrou por um convite que ainda vale,** a tela avisa ("Fulano entrou pelo convite de Sicrano, que continua ativo") e oferece **Cancelar convite** no próprio aviso (GRV-20, 31), para quem tem `members.invite`. O convite é o da participação (GRV-29), o último pelo qual a pessoa entrou ou subiu, e não outro em que ela aparece. _(Alterada em 2026-11-21: antes, a tela escolhia qualquer convite ativo pelo qual a pessoa tinha passado.)_
  - _Por quê:_ a decisão de fechar a porta fica com quem remove, na hora em que ela importa, e só para o convite que a pessoa usou.
- **GRV-38. _(Etapa C.)_ Em Configurações, "Quem pode entrar"** (GRV-25) mostra o modo atual ("Só com convite" ou "Aberto, com pedido") e abre um painel de baixo com as duas opções, cada uma com uma linha explicando o que muda.
- **GRV-39. _(Etapa C.)_ No grupo aberto, quem é de fora e abre `/v2/groups/{publicId}`** vê a apresentação (GRV-26) com **Pedir para entrar**. Com o pedido esperando, vê "Pedido enviado" e **Cancelar pedido** (GRV-27). No grupo de convite, a página mostra que o grupo não foi encontrado.

## 3. Como funciona

### Dados (single-table, sem GSI)

| Item                     | Chave                                              | Para quê                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grupo                    | `GROUP2#<id>` / `META`                             | `id` (uuid, o do sistema), `publicId` (GRV-08), `name`, `joinMode` (GRV-25), `logoMediaId` e `coverMediaId` (GRV-09, só quando há imagem; as URLs são montadas na resposta, MID-12), `createdAt`, `updatedAt`, `version` (ADR 0013)                                                                                                     |
| Id público → grupo       | `LOOKUP#GROUP2#PUBLIC#<publicId>` / `META`         | `{ id }`, com `attribute_not_exists` ao criar (GRV-08). Toda rota com o grupo na URL lê este lookup primeiro                                                                                                                                                                                                                            |
| Participação             | `GROUP2#<id>` / `MEMBER#<userId>`                  | `tier` (`member` ou `reserve`), `role` (`owner` ou `member`), `createdAt` (a data de entrada), `inviteId` e `invitedBy` (o convite pelo qual entrou ou subiu e quem o criou, quando houver, GRV-29). Os participantes são uma Query `begins_with(SK, "MEMBER#")`; o número de participantes (GRV-21), a mesma Query com `Select: COUNT` |
| Grupos da pessoa         | `LOOKUP#USER#<userId>#GROUP2` / `<groupId>`        | "meus grupos": Query → BatchGet do `META` e da `MEMBER#<userId>` de cada grupo                                                                                                                                                                                                                                                          |
| Convite                  | `GROUP2#<id>` / `INVITE#<inviteId>`                | entidade (`newEntity`): `token`, `createdBy`, `tier`, `expiresAt` e `maxUses` (quando há), `uses`, `target` (`{ userId }` ou `{ email }`, quando é para uma pessoa), `revokedAt` ou `declinedAt`, `ttl` (30 dias depois de deixar de valer, ADR 0004). Os convites do grupo são uma Query `begins_with(SK, "INVITE#")`                  |
| Token → convite          | `LOOKUP#GROUP2#INVITE#<token>` / `META`            | `{ groupId, inviteId }` (a chave do convite), gravado com o convite                                                                                                                                                                                                                                                                     |
| Convites para a pessoa   | `LOOKUP#USER#<userId>#GROUP2INVITE` / `<inviteId>` | `{ groupId, inviteId }`, do convite pelo id público (GRV-24)                                                                                                                                                                                                                                                                            |
| Convites para o email    | `LOOKUP#EMAIL#<email>#GROUP2INVITE` / `<inviteId>` | `{ groupId, inviteId }`, do convite pelo email (GRV-24)                                                                                                                                                                                                                                                                                 |
| Id → convite pessoal     | `LOOKUP#GROUP2INVITEID#<inviteId>` / `META`        | `{ groupId, inviteId }`, só no convite para uma pessoa: recusar (GRV-24) recebe só o id do convite                                                                                                                                                                                                                                      |
| Quem entrou pelo convite | `GROUP2#<id>` / `INVITEUSE#<inviteId>#<userId>`    | `createdAt` (GRV-19). Entidade de relação (ADR 0009). Some junto com o convite: tem o mesmo `ttl` dele                                                                                                                                                                                                                                  |
| Pedido                   | `GROUP2#<id>` / `REQUEST#<userId>`                 | `groupId`, `userId`, `createdAt` (GRV-27). Entidade de relação. Os pedidos do grupo são uma Query `begins_with(SK, "REQUEST#")`; o pedido da própria pessoa, um GetItem                                                                                                                                                                 |

- **Criar o grupo** grava o grupo, a participação do dono, o lookup do usuário e o lookup público na mesma transação. Um código público que já existe (chance desprezível) faz o service gerar outro e tentar de novo.
- **Criar o convite** grava o convite, o lookup do token e, quando é para uma pessoa, o lookup dela, numa transação.
- **Entrar por convite** (GRV-22), numa transação: soma 1 em `uses` com a condição de valer (sem `revokedAt` nem `declinedAt`, `expiresAt` no futuro e, no convite com limite, `uses` igual ao que foi lido: se outro uso entrou antes, o service relê e decide de novo), grava ou sobe a participação (com o `inviteId` e o `invitedBy`), grava o lookup do usuário, o `INVITEUSE` e apaga o pedido, se houver. Ao atingir o limite, o `ttl` é gravado no convite e nos lookups dele.
- **O `ttl` do convite** (30 dias depois de deixar de valer) vale também para os lookups dele e os `INVITEUSE`. Com prazo, ele é conhecido ao criar e vai em tudo o que é gravado. Sem prazo, ele entra ao cancelar, recusar ou esgotar: os lookups na mesma transação, e os `INVITEUSE` já gravados logo depois, fora da transação (um convite sem limite pode ter muitos usos). Se essa segunda escrita falhar, o uso que sobrar é ignorado na lista.
- **Sair e remover** apagam a participação (com `attribute_exists`) e o lookup numa transação.
- A situação do convite (GRV-19) é calculada ao ler, a partir dos campos e da hora: não há campo `status`.
- O perfil das pessoas vem do módulo de usuários, de uma vez (`getMany`). O email da pessoa logada (GRV-23) vem da parte privada dela (USR-13).
- A api traduz o público para o uuid na entrada do service; as chaves só conhecem o uuid. A mídia do logo e da capa é do grupo pelo uuid (`ownerType = group`, `ownerId = <id>`), que fica só no banco: o endereço público é só a finalidade e o id da mídia (MID-12). O prefixo `GROUP2` é provisório: na troca, o módulo antigo sai e o novo passa a usar `GROUP` (sem dados em produção, a tabela é recriada, ADR 0017).

### Rotas

| Rota                                                         | Quem                  | Regras                  |
| ------------------------------------------------------------ | --------------------- | ----------------------- |
| `POST /v2/groups`                                            | logado                | GRV-01, 02, 03, 08      |
| `GET /v2/groups/{publicId}`                                  | quem participa        | GRV-04, 08              |
| `GET /v2/me/groups`                                          | logado                | GRV-05                  |
| `POST /v2/groups/{publicId}/images/{slot}/upload`            | `group.edit`          | GRV-09 (MID-03, 04)     |
| `PUT /v2/groups/{publicId}/images/{slot}`                    | `group.edit`          | GRV-09, 10 (MID-05–09)  |
| `DELETE /v2/groups/{publicId}/images/{slot}`                 | `group.edit`          | GRV-09, 10 (MID-10, 11) |
| `POST /v2/groups/{publicId}/invites`                         | `members.invite`      | GRV-18, 23              |
| `GET /v2/groups/{publicId}/invites`                          | `members.invite`      | GRV-19                  |
| `DELETE /v2/groups/{publicId}/invites/{inviteId}`            | `members.invite`      | GRV-20                  |
| `GET /v2/invites/{token}`                                    | logado                | GRV-21                  |
| `POST /v2/invites/{token}/join`                              | logado                | GRV-22                  |
| `GET /v2/me/group-invites`                                   | logado                | GRV-24                  |
| `DELETE /v2/me/group-invites/{inviteId}`                     | para quem é           | GRV-24                  |
| `PUT /v2/groups/{publicId}/join-mode`                        | `group.edit`          | GRV-25 (etapa C)        |
| `GET /v2/groups/{publicId}/preview`                          | logado (grupo aberto) | GRV-26 (etapa C)        |
| `POST /v2/groups/{publicId}/requests`                        | logado (grupo aberto) | GRV-27 (etapa C)        |
| `DELETE /v2/groups/{publicId}/requests/me`                   | logado                | GRV-27 (etapa C)        |
| `GET /v2/groups/{publicId}/requests`                         | `members.invite`      | GRV-28 (etapa C)        |
| `POST /v2/groups/{publicId}/requests/{userPublicId}/approve` | `members.invite`      | GRV-28 (etapa C)        |
| `DELETE /v2/groups/{publicId}/requests/{userPublicId}`       | `members.invite`      | GRV-28 (etapa C)        |
| `GET /v2/groups/{publicId}/members`                          | quem participa        | GRV-29                  |
| `DELETE /v2/groups/{publicId}/members/me`                    | quem participa        | GRV-30                  |
| `DELETE /v2/groups/{publicId}/members/{userPublicId}`        | `members.remove`      | GRV-31                  |

Erros: `VALIDATION_ERROR`, `GROUP_NOT_FOUND`, `GROUP_PERMISSION_DENIED` (403), `GROUP_INVITE_INVALID` (404, `details.reason`), `GROUP_INVITE_NOT_FOR_YOU` (403), `GROUP_INVITE_LIMIT` (409, `details.limit`), `USER_NOT_FOUND` (404), `GROUP_REQUEST_NOT_FOUND` (404), `GROUP_MEMBER_NOT_FOUND` (404), `GROUP_OWNER_NOT_REMOVABLE` (409), `VERSION_CONFLICT`. Os do logo e da capa vêm da mídia (`MEDIA_NOT_FOUND`, `MEDIA_NOT_UPLOADED`, `MEDIA_INVALID`). Avisos: `group_invited`, `group_join_requested`, `group_join_approved`.

## 4. Limites conhecidos

- Não há limite de grupos por pessoa, de participantes por grupo nem de pedidos esperando. Convites ativos: até 50 por grupo (GRV-18).
- O app não manda email: o convite por email é copiado e mandado por quem criou (GRV-23).
- Não há bloqueio: quem foi removido volta por um convite que ainda vale, e pode pedir de novo num grupo aberto.
- Membro e reserva só se diferenciam quando houver agenda. Não há como passar um membro para reserva.
- O dono não sai nem passa o grupo para outra pessoa (GRV-30): isso vem com os cargos.
- As permissões são fixas: o Dono tem todas e o cargo base, nenhuma (GRV-15).
- O grupo não muda de nome, não é arquivado nem apagado. Por isso, as mídias de um grupo nunca ficam sem dono.
- A cor sem imagem (GRV-11) vem do id público: se um dia o código mudar (GRV-08), a cor muda junto.

## 5. Em discussão (ainda não é regra)

- **Próximas etapas, nesta ordem:** cargos e permissões → arquivar → agenda (partidas recorrentes e avulsas, `GROUP2#<id>/AGENDA#...`, com os times de cada partida e a prioridade de membros sobre reservas) → regras e aviso fixado → financeiro (mensalidade e rateio) → ligar a competição.
- **Cargos (aprovado em 2026-11-21, ainda sem regra):** um cargo por pessoa; o dono cria cargos com nome livre e marca as permissões de cada um (GRV-15). Os cargos têm ordem: Dono no topo (fixo, com tudo, inclusive as permissões que vierem), o cargo base embaixo (fixo, editável, nasce sem nenhuma permissão), e os criados no meio. A permissão "gerenciar cargos" só age abaixo do próprio cargo e só dá as permissões que a pessoa tem; ninguém mexe no próprio cargo. Remover e cancelar convites seguem a mesma ordem. Sem Admin pronto: ao criar um cargo, há modelos (Admin, Tesoureiro, Organizador). Permissão nova no catálogo nasce desmarcada em todos os cargos. Passar o grupo e arquivar continuam só do dono. O cargo base precisa de um nome que não se confunda com "membro" da participação.
- **Passar membro para reserva:** quem e como, se fizer falta.
- **Mandar o convite por email**, quando o SES tiver domínio verificado.
- **Bloqueio:** impedir que uma pessoa removida volte, se cancelar o convite não bastar.
- **Esporte:** só como filtro do marketplace, fora do grupo.
