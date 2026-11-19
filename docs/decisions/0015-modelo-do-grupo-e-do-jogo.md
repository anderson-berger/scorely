# 0015: Modelo do grupo, do esporte e do jogo

- Data: 2026-11-15
- Estado: aceita

## Contexto

Revisão dos dados antes do primeiro deploy. Ainda não há dados em produção, então mudar o modelo agora custa recriar a tabela; depois do deploy, cada mudança vira migração. O grupo de hoje tem um esporte, um dia e um horário, local em texto, o dono copiado no `META` e os padrões do jogo misturados com a identidade do grupo. O jogo só existe dentro do grupo, e a presença usa um uuid e dois lookups.

Decidido com o dono em 2026-11-15:

- o grupo joga um esporte só, de um catálogo cadastrado por nós; quem joga outro esporte cria outro grupo (decidido em 2026-11-15, depois de "vários esportes");
- o grupo tem vários horários, mais de um no mesmo dia, sem sobreposição;
- o grupo tem lugares salvos com coordenadas;
- a configuração do grupo é o padrão, e cada jogo tem a sua;
- o dono só aparece na participação;
- os cargos são criados pelo grupo;
- o jogo é um módulo próprio e é dono dos seus jogadores.

## Decisão

Tudo o que é do grupo mora na partição dele ([0014](0014-itens-do-grupo-na-particao-do-grupo.md)).

### Esporte: catálogo no banco

```
SPORT#<sportId> / META    { id, name: { "pt-BR": "Vôlei", en: "Volleyball" }, positions: [{ id, name, active }], limits: { maxSlots, ... }, active }
LOOKUP#SPORT              / <sportId>   { id }      ← a lista do catálogo
```

- **O id é legível e não muda nunca** (`volleyball`, `beach_volleyball`).
- **O nome vem traduzido do banco,** porque o web não conhece um esporte cadastrado depois do deploy.
- **Sem `other`:** todo esporte é cadastrado.
- **Esporte não é apagado,** só desativado (`active: false`): ele some da escolha, e os grupos e jogos antigos continuam com o nome.
- **Os limites do esporte** (ex.: vagas do vôlei) se somam aos do plano: vale o menor dos dois.

### Grupo

```
GROUP#g / META              name, sportId, timeZone, archivedAt?, logoMediaId?, coverMediaId?
GROUP#g / SETTINGS          slots, minPlayers?, listOpensHoursBefore, reservesOpenHoursBefore,
                            guestsOpenHoursBefore?, defaultPlaceId?, maxMembers, maxReserves
GROUP#g / INVITES           inviteToken, reserveInviteToken, guestToken   (ausentes quando arquivado)
GROUP#g / COUNTERS          memberCount, reserveCount
GROUP#g / ROLES             os cargos do grupo, num item só
GROUP#g / SCHEDULE#<id>     weekday, start, end, placeId?, slots?, minPlayers?
GROUP#g / PLACE#<id>        name, address { street, number?, district?, city, state, country, postalCode? },
                            lat, lng, archivedAt?
GROUP#g / MEMBER#<u>        joinedAt, tier ("member" | "reserve"), roleId
GROUP#g / MEMBER_INVITE#<u> expiresAt, ttl
GROUP#g / COMPETITION       regulamento e ativação
GROUP#g / TEAM_SETTINGS     configuração dos times
GROUP#g / PLAN              o plano (o modelo de cobrança fica para depois)

LOOKUP#USER#<u>#GROUP / g          meus grupos
LOOKUP#SPORT#<sportId>#GROUP / g   grupos de um esporte (mesma transação que cria o grupo)
LOOKUP#GROUP#{INVITE,RESERVE_INVITE,GUEST}#<token> / META   abrir um link
```

- **O `META` é só a identidade,** e todo módulo o lê por GetItem. Nada secreto fica nele (os tokens moram no `INVITES`), nem dono, nem padrão do jogo.
- **O padrão do jogo é uma cascata:** `SETTINGS` (grupo) → `SCHEDULE#` (horário) → o jogo. Cada nível só guarda o que muda. Mudar o padrão muda os jogos que não têm valor próprio.
- **Horários:**
  - Dois horários do grupo não se sobrepõem: o fim é exclusivo, então 15:00–16:00 e 16:00–17:30 podem existir juntos.
  - O limite de horários por grupo vem do plano, e não do contrato.
- **Lugares:**
  - O lugar não é apagado, só arquivado, para o jogo antigo continuar com o local.
  - "Ver rota" usa `lat`/`lng` num link do mapa, sem custo.
  - O autocompletar de endereço (Places) fica para depois, por custo: a pessoa marca o ponto ou cola o link.
- **Dono e cargos:**
  - O dono é o cargo `owner` na participação. Não há `ownerId` no grupo, e o `ownerId` sai da resposta do grupo (a lista de membros traz o `isOwner`).
  - Passar o grupo é uma transação nas duas participações, com a condição de que a antiga ainda seja `owner`. Isso garante um dono só.
- **A participação é o estado de agora:**
  - Sair apaga o item, e voltar cria outro com a data nova.
  - Os jogos antigos não dependem da participação: cada jogo guarda os seus jogadores.
  - O histórico de "entrou, saiu, mudou de cargo" vai para os eventos (a decidir na revisão de custo).
- **`tier` não é cargo:**
  - O `tier` diz como a pessoa **participa**: a camada em que confirma e o limite em que conta.
  - O `roleId` diz o que ela **administra**.
  - Os cargos do sistema são `owner` (tudo, não editável) e `member` (o padrão, editável). Os outros são criados pelo grupo.
  - As permissões são por área, com `none | view | edit`. A ação de excluir só ganha um nível próprio onde for diferente de editar.
  - Conferir permissão é um BatchGet de `MEMBER#<eu>` + `ROLES`, numa chamada só.
- **O contador garante os limites:** a entrada faz `ADD memberCount 1` com a condição `memberCount < maxMembers`, e a 31ª é recusada pelo banco.
- **Plano:**
  - Nunca se perde dado.
  - O que passa do plano (por falta de pagamento ou por passar o grupo a quem tem um plano menor) fica congelado em modo só leitura, com aviso e prazo. Passar o grupo nunca é bloqueado.
  - Se o plano é da pessoa ou do grupo, decidimos quando houver cobrança.

### Jogo

```
GAME#id / META         context, sportId (o do grupo; o seu no jogo sem grupo), startsAt, endsAt, placeId, slots, minPlayers?, camadas,
                       cancelledAt?, ...
GAME#id / COUNTERS     confirmados (a disputa pela vaga, como no grupo)
GAME#id / PLAYER#<u>   joinedAt, origin ("member" | "reserve" | "guest")

LOOKUP#GROUP#<g>#GAME#<scheduleId>#<date> / META   { id }   um jogo só por ocorrência do horário
```

- **O jogo é um módulo próprio, com um `context`.** Hoje só existe `{ type: "group", groupId, scheduleId? }`: o jogo de um horário, ou o jogo avulso do grupo, sem `scheduleId`. O jogo sem grupo, o da temporada e o entre times entram no `context` quando forem construídos, sem mudar o resto.
- **Quem pode entrar depende do `context`:** no jogo do grupo, só os membros e as reservas, além dos convidados pelo link do jogo.
- **O jogo é dono dos seus jogadores.**
  - A lista é uma Query em `PLAYER#`, ordenada em memória pela entrada.
  - Saem a `ATTENDANCE#<uuid>` e os dois lookups dela.
- **Identificação e jogo virtual:**
  - O jogo de um horário é identificado por **horário + data** (`<scheduleId>:<date>`). Se o horário muda, quem confirmou continua no mesmo jogo.
  - Antes da primeira escrita ele é calculado (virtual). O lookup garante que duas confirmações ao mesmo tempo não criam dois jogos.
- **Valores no jogo:**
  - O jogo guarda os seus valores (início, fim, lugar, vagas...) quando vira item, ou quando alguém muda um deles.
  - Antes disso, os valores vêm da cascata.
  - Remarcar é mudar o `startsAt`/`endsAt` desse jogo, sem sobrepor outro jogo do grupo.
- **Na tela, "Próximos jogos"** mostra a próxima ocorrência de cada horário e os avulsos futuros, em ordem de início.

## Por quê

- **Uma consulta para cada pergunta da tela, e nenhum dado guardado duas vezes.** O lookup é índice (só o id), não cópia.
- **Um item por assunto que se edita:** cada um tem a sua `version` ([0016](0016-version-confere-nas-edicoes.md)), e editar um horário não conflita com quem muda o nome do grupo.
- **O jogo como módulo próprio deixa o avulso, a temporada e os times para depois** sem refazer o modelo.
- **Sem dados em produção:** é o último momento barato para mudar.

## Consequências

- Mudam os docs de grupos, competição e times, e nasce um doc para o jogo e um para os esportes. Cada parte vira uma tarefa do `/task`, com as regras novas.
- `GAME_DURATION_HOURS` sai, porque o fim vem do horário ou do jogo.
- As rotas `/games/{date}` passam a usar o id do jogo (ou `<scheduleId>:<date>` no jogo virtual).
- Busca por distância ("vôlei perto de mim") não cabe em lookup sem GSI e vai precisar de outra solução, com custo.
- Regra: `.claude/rules/dynamodb.md`.

## Atualização (2026-11-15, tarefa dos horários e do jogo)

Decidido com o dono ao implementar os horários:

- **O id do jogo de um horário é `<scheduleId>_<data>`.** A chave `GAME#<scheduleId>_<data>` já é única por ocorrência, então sai o lookup `LOOKUP#GROUP#<g>#GAME#<scheduleId>#<date>`. Fica `LOOKUP#GROUP#<g>#GAME / <startsAt>#<gameId>`, para listar os jogos do grupo. O jogo avulso terá um uuid.
- **Sem o `GAME#<id>/COUNTERS`.** A fila é implícita e não tem limite, então a ordem de chegada (o `confirmedAt` do `PLAYER#`) resolve a vaga. O contador volta se houver um limite de confirmações.
- **As regras e o código do jogo continuam no módulo de grupos** (`grupos.md`, `modules/groups`) enquanto o único `context` for o grupo. O modelo no banco já é o desta ADR. O doc e o módulo do jogo nascem com o jogo sem grupo.
