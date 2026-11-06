# 007 — Grupos E2: reservas e lista em camadas

Pedido do dono (2026-11-06): link de membro e link de reserva, e a lista abrindo em camadas (membros → reservas → aberto), configurável. Base: plano 003 (E1) e plano 006.

## Objetivo

O dono controla quem pode confirmar e a partir de quando:

| Camada    | Quem                                      | Como entra                          | Pode confirmar a partir de           |
| --------- | ----------------------------------------- | ----------------------------------- | ------------------------------------ |
| Membros   | membro do grupo                           | link de membro (E1)                 | `startsAt − listOpensHoursBefore`    |
| Reservas  | reserva do grupo                          | **link de reserva** (novo)          | `startsAt − reservesOpenHoursBefore` |
| Convidado | qualquer pessoa logada com o link do jogo | **link do jogo** (novo, desligável) | `startsAt − guestsOpenHoursBefore`   |

Uma lista só, na ordem de confirmação, com a fila da E1 (D4 do 003). As camadas só mudam **quando** cada um pode confirmar.

## Fora de escopo

- Avisar quando uma camada abre (precisaria de agendamento; D1 do 003 evita cron).
- O dono tirar um convidado da lista ou mudar as vagas depois de criado o grupo.
- Promover reserva a membro por botão (dá para fazer pelo link de membro, D5).
- Histórico de jogos.

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                     | Por quê                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Ordem por chegada, sem "furar fila"** (pergunta 1): quem confirmou primeiro fica com a vaga, seja membro, reserva ou convidado. Um membro que confirma depois de a lista lotar vai para a fila. A prioridade dos membros vem só da janela exclusiva                                                                                                                                                                       | previsível ("confirmei, estou dentro"); nenhuma escrita de rebaixamento nem aviso de "você saiu da lista"; reaproveita D4/D6 do 003 sem mudança |
| D2  | Grupo ganha `reservesOpenHoursBefore` (0 ≤ x ≤ `listOpensHoursBefore`) e `guestsOpenHoursBefore` (opcional; ausente = convidados desligados; 0 ≤ y ≤ `reservesOpenHoursBefore`). Padrões na criação: reservas = `listOpensHoursBefore`/2 arredondado para baixo; convidados desligados                                                                                                                                      | horas antes do início, como o campo que já existe; a ordem membros ≥ reservas ≥ convidados garante as camadas                                   |
| D3  | Grupo criado antes da E2 (sem os campos) é lido como `reservesOpenHoursBefore = listOpensHoursBefore` e convidados desligados                                                                                                                                                                                                                                                                                               | só existe dado de dev; não precisa migração                                                                                                     |
| D4  | Reserva = lookup próprio `LOOKUP#GROUP#<g>#RESERVE` (`SK=<userId>`, `{ id: userId }`) + o mesmo `LOOKUP#USER#<u>#GROUP` do membro, numa transação. Quem é reserva vê o grupo como membro (página, jogo, lista), mas não vê o link de convite nem remove ninguém                                                                                                                                                             | lookup só com o id (regra do DynamoDB); "meus grupos" continua uma Query só                                                                     |
| D5  | Links: `reserveInviteToken` + lookup `LOOKUP#GROUP#RESERVE_INVITE#<token>`; `guestToken` + lookup `LOOKUP#GROUP#GUEST#<token>`. Trocar = mesma transação da D9 do 003. Aceitar o link de reserva já sendo membro → nada muda; aceitar o de membro sendo reserva → vira membro (Delete do lookup de reserva + Put do de membro, numa transação)                                                                              | o papel sai de qual lookup existe; sem rebaixar membro por engano                                                                               |
| D6  | Grupo antigo sem `reserveInviteToken`/`guestToken`: o dono gera pela troca (`POST /groups/{id}/invite` com o `kind`), que nesse caso só faz o Put                                                                                                                                                                                                                                                                           | sem migração                                                                                                                                    |
| D7  | **Link do jogo** (`/play/<guestToken>`): leva sempre ao jogo atual do grupo. Qualquer pessoa logada vê o nome do grupo, o horário, o local e a lista com nomes, e confirma quando a camada de convidados abre. Convidado não vira membro e não vê membros nem links. Membro ou reserva que abre o link é tratado pelo papel dele (o web leva para a página do grupo). Convidados desligados → o link dá `GAME_LINK_INVALID` | o dono compartilha um link por grupo no WhatsApp, toda semana; não suja a lista de membros                                                      |
| D8  | `Game` ganha `reservesOpensAt`, `guestsOpensAt?` e `myOpensAt?` (quando **quem pede** pode confirmar; ausente = nunca). O `status` continua o da camada dos membros. Confirmar antes de `myOpensAt` → `GAME_LIST_NOT_OPEN` com `details.opensAt = myOpensAt`; convidado com a camada desligada → `GAME_LINK_INVALID`                                                                                                        | o web mostra "você pode confirmar a partir de ..." sem saber as regras                                                                          |
| D9  | `Attendee` e `Member` ganham `role: member \| reserve \| guest` (`Member` só `member`/`reserve`), calculado na leitura pelos lookups atuais                                                                                                                                                                                                                                                                                 | a lista mostra quem é reserva ou convidado; papel mudou → a lista mostra o novo                                                                 |
| D10 | Remover reserva = D12 do 003 com o lookup de reserva e a troca do **link de reserva**. Desistir de convidado = desistir da E1. A promoção da fila (D6 do 003) vale para todos                                                                                                                                                                                                                                               | mesma transação, mesmo aviso                                                                                                                    |
| D11 | `PATCH /groups/{id}` (dono) muda só `listOpensHoursBefore`, `reservesOpenHoursBefore` e `guestsOpenHoursBefore` (`null` desliga convidados). O service junta com o valor atual e confere a ordem da D2 → `GROUP_LAYERS_INVALID` (422, `details: { field }`)                                                                                                                                                                 | grupos já criados também precisam configurar as camadas; mexer em vagas fica fora                                                               |

## Contrato

Rotas novas ou alteradas (as outras da E1 ficam iguais):

| Rota                                              | Quem              | Resposta / erros                                                                                                                                                                   |
| ------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /groups`                                    | logado            | aceita `reservesOpenHoursBefore?` e `guestsOpenHoursBefore?` · 422 / `GROUP_LAYERS_INVALID`                                                                                        |
| `PATCH /groups/{id}`                              | dono              | 200 `Group` · `GROUP_NOT_OWNER` · `GROUP_LAYERS_INVALID` · 422                                                                                                                     |
| `GET /groups/{id}`                                | membro ou reserva | `Group` com `inviteToken`, `reserveInviteToken`, `guestToken` só para o dono; ganha `myRole`                                                                                       |
| `POST /groups/{id}/invite`                        | dono              | body `{ kind?: 'member' \| 'reserve' \| 'guest' }` (padrão `member`) → 200 `{ kind, token }` · `GROUP_NOT_OWNER` · `kind: 'guest'` com convidados desligados → `GAME_LINK_INVALID` |
| `POST /invites/{token}/accept`                    | logado            | aceita token de membro ou de reserva → 200 `Group` (D5) · `GROUP_INVITE_INVALID`                                                                                                   |
| `GET /groups/{id}/members`                        | membro ou reserva | `Member[]` com `role` (membros primeiro, dono no topo, depois reservas)                                                                                                            |
| `DELETE /groups/{id}/members/{userId}`            | dono              | remove membro ou reserva (D10)                                                                                                                                                     |
| `GET /groups/{id}/games/current` e as de presença | membro ou reserva | `Game` com os campos da D8; presença respeita `myOpensAt`                                                                                                                          |
| `GET /play/{token}`                               | logado            | 200 `GuestGame` `{ group: { id, name, sport, weekday, time, timeZone, location? }, myRole, game: Game }` · `GAME_LINK_INVALID` (404)                                               |
| `POST /play/{token}/games/{date}/attendance`      | logado            | 200 `Game` · `GAME_LINK_INVALID` · erros de jogo da E1                                                                                                                             |
| `DELETE /play/{token}/games/{date}/attendance`    | logado            | 204 · mesmos erros                                                                                                                                                                 |

Schemas (`@scorely/contracts/groups.ts`):

- `GROUP_LIMITS.reservesOpenHoursBefore` e `.guestsOpenHoursBefore`: `{ min: 0, max: 144 }`.
- `GroupRoleSchema = z.enum(['member', 'reserve', 'guest'])`; `MemberRoleSchema = GroupRoleSchema.exclude(['guest'])`.
- `CreateGroupInputSchema` + `reservesOpenHoursBefore?`, `guestsOpenHoursBefore?`, com `.superRefine` da ordem (D2) gerando issue `custom` no campo que quebrou (sem reservas, confere com a metade da antecedência dos membros).
- `GroupLayersSchema`: os 3 valores finais (`guestsOpenHoursBefore` pode ser `null`/ausente) com a mesma regra de ordem. O service valida com ele o grupo depois de juntar o `PATCH` e, se falhar, lança `GROUP_LAYERS_INVALID` com o `field` do issue.
- `RotateInviteInputSchema` = `{ kind: InviteKindSchema.default('member') }` (body opcional).
- `UpdateGroupInputSchema`: os 3 campos opcionais, `guestsOpenHoursBefore` aceita `null`; pelo menos um campo.
- `GroupSchema` + `reservesOpenHoursBefore`, `guestsOpenHoursBefore?`, `reserveInviteToken?`, `guestToken?`, `myRole: MemberRoleSchema`.
- `InviteSchema` passa a `{ kind: InviteKindSchema, token }` (`InviteKindSchema = z.enum(['member', 'reserve', 'guest'])`). **Muda o formato da resposta de hoje** (`{ inviteToken }`); o web é atualizado junto.
- `MemberSchema` + `role: MemberRoleSchema`; `AttendeeSchema` + `role: GroupRoleSchema`.
- `GameSchema` + `reservesOpensAt`, `guestsOpensAt?`, `myOpensAt?`.
- `GuestGameSchema` (rota `/play`).

Erros novos (4 lugares): `GAME_LINK_INVALID` (404), `GROUP_LAYERS_INVALID` (422, `details: { field: 'reservesOpenHoursBefore' \| 'guestsOpenHoursBefore' }`).

## Interface (para os testes)

Os testes da E1 (`groups.service.test.ts`) que usam o formato antigo do convite (`{ inviteToken }`), o `isMember` ou o `addMember` sem papel mudam junto com o contrato, pelo `test-writer`. O comportamento da E1 continua o mesmo.

`api/src/lib/zoned.ts`: `currentOccurrence(schedule, now)` continua igual; nova função pura

```ts
export function layerOpensAt(startsAt: string, hoursBefore: number): string; // ISO UTC
```

`groups/group.repository.ts` (além do que já existe):

```ts
type MemberRole = 'member' | 'reserve';
type InviteKind = 'member' | 'reserve' | 'guest';
roleOf(groupId: string, userId: string): Promise<MemberRole | undefined>; // consistente
addMember(groupId: string, userId: string, role: MemberRole): Promise<void>; // D5: reserva → membro troca; membro + reserva = nada
listMembers(groupId: string): Promise<{ userId: string; role: MemberRole }[]>;
getByToken(token: string): Promise<{ group: StoredGroup; kind: InviteKind } | undefined>;
rotateToken(group: StoredGroup, kind: InviteKind, newToken: string): Promise<void>; // sem token antigo → só o Put (D6)
update(groupId: string, patch: { listOpensHoursBefore?: number; reservesOpenHoursBefore?: number; guestsOpenHoursBefore?: number | null }): Promise<StoredGroup>;
removeMember(input: { group; userId; role: MemberRole; newToken; attendance? }): Promise<RemoveMemberResult>; // troca o token do papel removido
```

`StoredGroup` passa a ter `reserveInviteToken?` e `guestToken?`. `isMember` sai (o `roleOf` cobre). O repositório em memória dos testes segue essas regras.

`groups.deps.ts`: `requireMember` devolve `{ group, role }` e aceita membro ou reserva; `requireOwner` igual ao de hoje (devolve o grupo).

`groups/group.service.ts`: `create`, `update(userId, groupId, patch)`, `rotateInvite(userId, groupId, kind)`, `acceptInvite`, `members`, `removeMember` (membro ou reserva). `groups/game.service.ts`: `current`, `confirm`, `leave` ganham a versão por link: `guestView(userId, token)`, `guestConfirm(userId, token, date)`, `guestLeave(userId, token, date)`.

Regra de quem pode confirmar (`myOpensAt`), com `startsAt` da ocorrência:

- membro → `startsAt − listOpensHoursBefore`;
- reserva → `startsAt − reservesOpenHoursBefore`;
- convidado → `startsAt − guestsOpenHoursBefore`; desligado → sem `myOpensAt` e `GAME_LINK_INVALID`.

Web (`modules/groups`), bloco 2:

- Rota `play/:token` (nome `play`, `PlayPage.vue`), não pública: o guard manda para o login com `redirect`, como o `/join`.
- `groupsApi`: `play(token)` → `GuestGame`; `playConfirm(token, date)` → `Game`; `playLeave(token, date)`; `update(id, patch: UpdateGroupInput)` → `Group`; `rotateInvite(id, kind)` → `Invite`.
- `groups/links.ts`, funções puras:
  - `inviteUrl(origin: string, kind: InviteKind, token: string): string` → `<origin>/join/<token>` para `member`/`reserve`, `<origin>/play/<token>` para `guest` (token com `encodeURIComponent`).
  - `playRedirect(view: GuestGame): { name: 'group'; params: { id: string } } | undefined` → membro ou reserva vai para a página do grupo; convidado fica (`undefined`).
  - `listGate(game: Game, now: Date): { kind: 'can_change' } | { kind: 'opens_at'; at: string } | { kind: 'closed' }` → `closed` se o status é `in_progress`/`cancelled` ou não há `myOpensAt`; `opens_at` com `myOpensAt` enquanto `now` < `myOpensAt`; senão `can_change`. A página do grupo e a do link do jogo usam para mostrar os botões ou "você pode confirmar a partir de ...".
- Página do grupo (dono): os 3 links, cada um com copiar e trocar; o de convidados só aparece com convidados ligados. Configuração das camadas (`PATCH`) num diálogo ou card do dono. Lista com o papel (reserva/convidado) ao lado do nome.
- "Criar grupo": campos de reservas e convidados (convidados com um interruptor; desligado = sem o campo).

### Lacunas fechadas na implementação (bloco 1)

- Link do jogo com convidados desligados: `GAME_LINK_INVALID` para todos, inclusive membro e reserva (o dono desligou o link; eles usam a página do grupo).
- Aviso `waitlist_promoted` para convidado: link `/play/<guestToken>` (ele não abre `/groups/<id>`). Membro e reserva continuam com `/groups/<id>`.
- D3: quem completa `reservesOpenHoursBefore` do grupo antigo é o service (`reservesHours` em `groups.deps.ts`); o `PATCH` grava o valor efetivo.

## Casos de comportamento

Relógio: quinta 2026-11-05 10:00 em São Paulo, jogo sexta 19:00 (33 h depois), salvo indicação.

1. Criar grupo sem os campos novos, `listOpensHoursBefore` 48 → `reservesOpenHoursBefore` 24, convidados desligados, `reserveInviteToken` e `guestToken` gerados; o dono vê os 3 links, membro e reserva não veem nenhum.
2. Criar com reservas 50 e membros 48, ou convidados 30 e reservas 24 → 422 com issue no campo que quebrou (contrato) e `GROUP_LAYERS_INVALID` no service.
3. Usuário aceita o link de reserva → `myRole: reserve`, aparece em "meus grupos" e em `members` com `role: reserve`; aceita de novo → nada duplica.
4. Reserva aceita o link de membro → vira membro (some do lookup de reserva). Membro aceita o link de reserva → continua membro.
5. Membros 48, reservas 24: às 10h de quinta (33 h antes) o membro confirma; a reserva recebe `GAME_LIST_NOT_OPEN` com `opensAt` = quinta 19:00; às 19:00 de quinta a reserva confirma.
6. O `Game` para a reserva traz `myOpensAt` = abertura das reservas; para o membro, `myOpensAt = opensAt`; `reservesOpensAt` e `guestsOpensAt` iguais para todos.
7. Vagas 2, membro A e reserva R dentro; membro B confirma → B na fila (D1); R desiste → B sobe e recebe `waitlist_promoted`.
8. Convidados desligados: `GET /play/<guestToken>` → `GAME_LINK_INVALID`; o dono liga convidados com 6 h pelo `PATCH` → o mesmo link vale; antes de 13:00 de sexta, o convidado vê o jogo com `myOpensAt` e confirmar dá `GAME_LIST_NOT_OPEN`; depois, confirma e aparece na lista com `role: guest`.
9. Convidado não vira membro: não aparece em `members` nem em "meus grupos", e `GET /groups/{id}` dá `GROUP_NOT_FOUND`. Desiste pelo link → sai da lista; se estava dentro, a fila sobe com aviso.
10. Membro ou reserva abre o link do jogo → `myRole` dele, e as regras dele valem (membro confirma com a camada de membros).
11. Dono troca o link de convidados → o antigo dá `GAME_LINK_INVALID`; troca o de reserva → o antigo dá `GROUP_INVITE_INVALID`; o de membro continua valendo. Membro tenta trocar → `GROUP_NOT_OWNER`.
12. Dono remove uma reserva confirmada → ela perde o acesso, sai da lista, o **link de reserva** muda e o de membro não; a fila sobe com aviso.
13. `PATCH` por membro → `GROUP_NOT_OWNER`; `PATCH { listOpensHoursBefore: 20 }` com reservas 24 → `GROUP_LAYERS_INVALID` (`field: reservesOpenHoursBefore`); `PATCH { guestsOpenHoursBefore: null }` desliga convidados.
14. Grupo sem os campos da E2 (D3): lido com reservas = membros, convidados desligados; o dono gera o link de reserva pela troca (D6) e ele passa a valer.
15. Reserva vê a página do grupo e a lista, mas não recebe os tokens e `removeMember` dá `GROUP_NOT_OWNER`.
16. Web: `inviteUrl` monta `/join/<token>` para membro e reserva e `/play/<token>` para convidado; `playRedirect` leva membro e reserva para a página do grupo e deixa o convidado; `listGate` dá `opens_at` antes da camada de quem vê, `can_change` depois e `closed` em jogo começado, cancelado ou sem camada.

## Tarefas

| #   | Tarefa (≤ 1h)                                                                                                                                                                                                 | Pronto quando                                                                    | Risco |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----- |
| 1   | Contrato: schemas da seção Contrato, 2 erros nos 4 lugares, `InviteSchema` novo                                                                                                                               | `npm run typecheck` aponta só os usos do `InviteSchema` antigo                   | Baixo |
| 2   | `test-writer`: casos 1–15 (bloco 1) e 16 (bloco 2)                                                                                                                                                            | testes falham por falta de implementação; staged                                 | Médio |
| 3   | `zoned.layerOpensAt` + regra do `myOpensAt`                                                                                                                                                                   | casos 5–6 verdes                                                                 | Baixo |
| 4   | Repositório: lookups de reserva, de link de reserva e de convidado; `roleOf`, `addMember` com papel, `getByToken`, `rotateToken`, `update`, `removeMember` por papel                                          | casos 3, 4, 11, 12 (repo em memória) verdes; transações conferidas pelo reviewer | Alto  |
| 5   | Services: criar/atualizar com a ordem das camadas, aceitar por tipo de link, `requireMember` com papel, presença por camada, `role` em `Attendee`/`Member`                                                    | casos 1–7, 13–15 verdes                                                          | Médio |
| 6   | Link do jogo: `guestView`/`guestConfirm`/`guestLeave` + rotas `/play`                                                                                                                                         | casos 8–10 verdes                                                                | Médio |
| 7   | Handlers + `functions.ts` (`PATCH /groups/{id}`, `/play/...`), IAM se faltar                                                                                                                                  | `npm run check` verde                                                            | Baixo |
| 8   | Web: página do grupo com os 3 links para o dono (copiar/trocar), "você pode confirmar a partir de ...", papel na lista; tela de configuração das camadas (dono); campos novos no "criar grupo"; i18n pt-BR/en | fluxo no navegador; nenhum texto fixo                                            | Médio |
| 9   | Web: `PlayPage` (`/play/:token`), `inviteUrl`, redirect no primeiro acesso como no `/join`                                                                                                                    | caso 16 verde                                                                    | Baixo |
| 10  | Roteiro manual (abaixo) + `reviewer`                                                                                                                                                                          | roteiro ok; sem ❌                                                               | Baixo |

Blocos para commit: **1** = tarefas 1–7 (contrato + api; o `test-writer` escreve os casos 1–15); **2** = 8–9 (web; `test-writer` do caso 16); **3** = 10. Motivo: os campos novos do contrato quebram o typecheck da api até ela ser implementada, e cada commit precisa do `npm run check` verde.

### Roteiro manual (~10 min)

1. Dono cria grupo para amanhã, 3 vagas, membros 144 h, reservas 2 h, convidados 1 h.
2. A entra pelo link de membro, R pelo link de reserva.
3. A confirma; R tenta → aviso "a partir de ..." no horário das reservas.
4. Dono muda as reservas para 144 h; R confirma.
5. G (5ª conta) abre o link do jogo → "a partir de ..."; dono muda convidados para 144 h; G confirma e aparece como convidado.
6. Dono confirma → 3/3; B entra como membro e confirma → fila.
7. G desiste → B sobe e é avisado.
8. Dono remove R → R perde o acesso; o link de reserva mudou; o de membro não.

## Perguntas (respondidas pelo dono em 2026-11-06)

1. **Prioridade (D1):** ordem por chegada. O membro não tira a vaga de ninguém; com a lista cheia, vai para a fila.
2. **Link do jogo (D7):** um link por grupo, que aponta sempre para o jogo atual.
3. **Padrões (D2):** abertura gradual. Ex.: jogo sexta 19h → membros quarta 19h (48 h), reservas quinta 19h (24 h), convidados desligados até o organizador liberar. Tudo configurável.
4. **Convidado vê quem confirmou (D7):** sim.

## Status

| Passo            | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado (2026-11-06)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2. Contrato      | ✅ schemas, `GroupLayersSchema`, `GAME_LINK_INVALID` e `GROUP_LAYERS_INVALID` nos 4 lugares; o typecheck só acusa a api e os testes da E1 que mudam neste bloco                                                                                                                                                                                                                                                                                   |
| 3. Testes        | ✅ bloco 1: `test-writer`, casos 1–15 (`groups.service.test.ts`, `zoned.layers.test.ts`; fixture do `timezone.contract.test.ts` ajustada por ele); falhavam antes da implementação                                                           ; bloco 2: `test-writer`, caso 16 (`links.test.ts`, 14 testes)                                                                                                                                       |
| 4. Implementação | bloco 1 (tarefas 1, 3–7) ✅; `npm run check` verde (api 213); repositório conferido no LocalStack (13 cenários: tokens, papéis, reserva→membro, PATCH com REMOVE, grupo antigo, remoção removed/not_member/stale); bloco 2 (tarefas 8–9) ✅: `links.ts`, `GameCard`/`GroupLinksCard`/`LayersCard`, `PlayPage`, campos no criar grupo; `npm run check` verde (web 55)                                                                              |
| 5. Revisão       | 🔄 bloco 1: `reviewer` aprovado com ressalvas, sem ❌ (`007-grupos-e2.bloco1.review.md`)                                                                                                                                                                                                                                                                             ; bloco 2: aprovado com ressalvas, sem ❌ (`007-grupos-e2.bloco2.review.md`) |
| 6. Entrega       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
