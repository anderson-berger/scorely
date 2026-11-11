# 013 — `Membership`: a participação no grupo vira entidade

## Objetivo

Hoje "fulano participa do grupo X" só existe como lookups (`#MEMBER`, `#RESERVE`, `LOOKUP#USER#<u>#GROUP`) que guardam apenas o `id`. Isso causa três problemas:

- não há onde gravar os dados da pessoa **naquele grupo** que a E3 (nível, função) e a E6 (rating, congelado) vão precisar;
- a data de entrada se perde quando uma reserva vira membro;
- "meus grupos" faz 3 leituras por grupo só para saber o grupo e o papel.

Este plano cria a entidade `Membership`, com o papel e as datas, e unifica os lookups de membro e reserva. A estrutura fica pronta para os campos da E3/E6, que entram depois sem migração. **Não muda nenhuma rota nem o que a api devolve.**

## Fora de escopo

- Os campos da E3/E6 (`level`, `positions`, `rating`, `ratingFrozen`), que entram nas próprias entregas.
- Expor `joinedAt` na api ou na tela ("membro desde"). Por ora o dado só passa a existir.
- O lookup único de token (as 3 leituras do "entrar por link").
- As leituras de jogo no "meus grupos" (`games.summary` por grupo), que ficam para a revisão da tabela Game.
- Arquivar ou apagar grupo e `sportId`.
- Testes de repositório contra o DynamoDB Local: ficam num plano próprio, logo depois deste (P3).
- Script de migração (só há dados de dev, P1).

## Decisões

- **D1. Chave natural.** `PK=MEMBERSHIP#<groupId>#<userId>`, `SK=META`. A chave já garante uma participação por pessoa por grupo, e "participa? com qual papel?" vira um Get só. Esta é uma exceção ao padrão `<ENTIDADE>#<uuid>` com `newEntity`, e vale **só para entidade de relação** (N:N), que não tem identidade própria além do par. Fica registrada no **ADR 0009** e numa ressalva em `dynamodb.md`.
- **D2. Item.** `{ groupId, userId, role, createdAt, roleChangedAt? }`, com `entity: "Membership"`. O `createdAt` é a data de entrada e **nunca muda**. O `roleChangedAt` registra quando a reserva virou membro. É um tipo interno da api (`MembershipRecord` em `membership.table.ts`), e não entra em `@scorely/contracts`, porque a resposta continua sendo o `Member`.
- **D3. Um lookup só para membro e reserva.** `LOOKUP#GROUP#<groupId>#MEMBERSHIP` / `<userId>` → `{ id: userId }`. O papel fica só na entidade, então a troca de papel não mexe em lookup. O `LOOKUP#USER#<userId>#GROUP` / `<groupId>` → `{ id: groupId }` continua igual. Com a chave natural, cada lookup já basta para montar as duas chaves (`GROUP#<g>` e `MEMBERSHIP#<g>#<u>`). Os lookups `#MEMBER` e `#RESERVE` deixam de existir.
- **D4. Leituras.** Todas com leitura consistente, como hoje:

  | Caso                   | Hoje              | Depois                                                                    |
  | ---------------------- | ----------------- | ------------------------------------------------------------------------- |
  | `roleOf`               | 2 Gets            | 1 Get em `MEMBERSHIP#<g>#<u>`                                             |
  | Meus grupos (N grupos) | 1 Query + 3N Gets | 1 Query + BatchGet com grupos **e** memberships (2N chaves, lotes de 100) |
  | Lista de membros       | 2 Queries         | 1 Query + BatchGet das memberships                                        |

  Na lista de membros, a ordem no service continua: dono, membros, reservas. Dentro de cada papel, a ordem passa a ser a da **data de entrada** (`createdAt`), em vez do `userId`.
- **D5. Transações.**

  | Operação         | Itens                                                             | Condições                                                                       |
  | ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
  | Criar grupo      | 7: grupo + 3 tokens + membership do dono + 2 lookups              | `attribute_not_exists` em todos                                                 |
  | Entrar           | 3: membership + 2 lookups                                         | `attribute_not_exists`; falhou = já entrou, e repetir não faz nada (como hoje)  |
  | Reserva → membro | **1 Update**: `SET role = 'member', roleChangedAt = :now`         | `role = 'reserve'`; falhou = já é membro ou saiu, e repetir não faz nada        |
  | Remover          | até 9: membership + 2 lookups + troca do token (3) + presença (3) | membership com `attribute_exists(PK) AND role = :roleLido`; token igual ao lido |

- **D6. Remoção em corrida.** Se a condição da membership (índice 0) falha, o repositório relê a membership de forma consistente. Se ela sumiu, o resultado é `not_member` (→ `GROUP_MEMBER_NOT_FOUND`, como no plano 006). Se ela existe com outro papel (a reserva foi promovida no meio), o resultado é `stale`, e o service relê e tenta de novo (como hoje). Isso fecha a corrida em que o token trocado seria o do papel errado.
- **D7. Interface do repositório.** `listGroupsOf(userId): string[]` vira `groupsOf(userId): { group, role }[]`, que já devolve o grupo e o papel, e o service de "meus grupos" passa a usá-lo. As outras assinaturas (`roleOf`, `addMember`, `removeMember`, `create`) **não mudam**. O `listMembers` passa a trazer também o `createdAt` de cada participante (`{ userId, role, createdAt }`), porque o service precisa dele para ordenar pela data de entrada (D9). Esse ajuste foi apontado no passo 3. Assim, o `game.service.ts` não muda.
- **D8. Dados existentes.** Só há dados de dev (P1), então não há script de migração: o dono recria a tabela local (`db:setup`) depois da mudança. Os itens antigos (`#MEMBER`/`#RESERVE`) não são lidos pelo código novo.
- **D9. Ordem da lista de membros.** É dono, membros e reservas, e dentro de cada papel por data de entrada (`createdAt` da membership), do mais antigo para o mais novo (P2).

## Contrato

Nenhuma mudança em `@scorely/contracts`: as rotas, os schemas e os erros ficam iguais. A única diferença visível é a ordem dentro de cada papel na lista de membros (D4).

## Modelo de dados

| Item              | PK                                  | SK          | Exemplo                                                                                                                                              | Mudança                                       |
| ----------------- | ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Membership        | `MEMBERSHIP#<groupId>#<userId>`     | `META`      | `{ "groupId": "3f2b…", "userId": "a1b2…", "role": "reserve", "createdAt": "2026-09-02T22:10:00.000Z", "roleChangedAt": "2026-10-14T18:03:11.000Z" }` | **novo**                                      |
| Membros do grupo  | `LOOKUP#GROUP#<groupId>#MEMBERSHIP` | `<userId>`  | `{ "id": "a1b2…" }`                                                                                                                                  | **novo** (no lugar de `#MEMBER` e `#RESERVE`) |
| Grupos do usuário | `LOOKUP#USER#<userId>#GROUP`        | `<groupId>` | `{ "id": "3f2b…" }`                                                                                                                                  | igual                                         |
| ~~Membros~~       | `LOOKUP#GROUP#<groupId>#MEMBER`     | `<userId>`  | —                                                                                                                                                    | **removido**                                  |
| ~~Reservas~~      | `LOOKUP#GROUP#<groupId>#RESERVE`    | `<userId>`  | —                                                                                                                                                    | **removido**                                  |

### As duas direções de busca

Há duas buscas, uma em cada direção. Cada uma tem o seu lookup, e os dois apontam para o **mesmo** item `Membership`. O dado existe num lugar só: os lookups guardam apenas o `id`, como manda o ADR 0002. Os três itens são gravados sempre na mesma transação.

```
            "quais grupos eu participo?"                 "quem participa deste grupo?"
   LOOKUP#USER#<userId>#GROUP / <groupId>      LOOKUP#GROUP#<groupId>#MEMBERSHIP / <userId>
                    │                                              │
                    └──────────────────┐        ┌──────────────────┘
                                       ▼        ▼
                         MEMBERSHIP#<groupId>#<userId> / META
                         { groupId, userId, role, createdAt, roleChangedAt,
                           (E3) level, positions, (E6) rating, ratingFrozen }
```

### Membership: propriedades

| Prop                                           | Tipo                  | Obrig. | Exemplo                                                   | Observação                                                 |
| ---------------------------------------------- | --------------------- | ------ | --------------------------------------------------------- | ---------------------------------------------------------- |
| `groupId`                                      | uuid                  | ✔      | `"3f2b8c1e-7a4d-4e1b-9c2a-5d6e7f8a9b0c"`                  | também está na chave; repetido para ler sem desmontar a PK |
| `userId`                                       | uuid                  | ✔      | `"5c4b3a29-1d0e-4f9a-8b7c-6d5e4f3a2b1c"`                  | idem                                                       |
| `role`                                         | `member` \| `reserve` | ✔      | `"member"`                                                | o único lugar onde o papel fica gravado                    |
| `createdAt`                                    | ISO UTC               | ✔      | `"2026-09-02T22:10:00.000Z"`                              | data de entrada; nunca muda                                |
| `roleChangedAt`                                | ISO UTC               | —      | `"2026-10-14T18:03:11.000Z"`                              | quando a reserva virou membro                              |
| `level`, `positions`, `rating`, `ratingFrozen` | —                     | —      | `4`, `["setter"]`, `{ "mu": 27.1, "sigma": 5.4 }`, `true` | **fora deste plano**: entram na E3/E6, sem migração        |

```json
{
  "PK": "MEMBERSHIP#3f2b8c1e-7a4d-4e1b-9c2a-5d6e7f8a9b0c#5c4b3a29-1d0e-4f9a-8b7c-6d5e4f3a2b1c",
  "SK": "META",
  "entity": "Membership",
  "groupId": "3f2b8c1e-7a4d-4e1b-9c2a-5d6e7f8a9b0c",
  "userId": "5c4b3a29-1d0e-4f9a-8b7c-6d5e4f3a2b1c",
  "role": "member",
  "createdAt": "2026-09-02T22:10:00.000Z",
  "roleChangedAt": "2026-10-14T18:03:11.000Z"
}
```

### Lookups: exemplos

```json
{ "PK": "LOOKUP#GROUP#3f2b8c1e-…#MEMBERSHIP", "SK": "5c4b3a29-…", "entity": "Lookup", "id": "5c4b3a29-…", "createdAt": "2026-09-02T22:10:00.000Z" }
{ "PK": "LOOKUP#USER#5c4b3a29-…#GROUP",       "SK": "3f2b8c1e-…", "entity": "Lookup", "id": "3f2b8c1e-…", "createdAt": "2026-09-02T22:10:00.000Z" }
```

### Buscas, passo a passo

```
Membros do grupo:
  1. Query    PK = LOOKUP#GROUP#<g>#MEMBERSHIP                → userIds
  2. BatchGet MEMBERSHIP#<g>#<u> (papel, entrada) + USER#<u> (nome)
  3. Ordena:  dono → membros → reservas, por data de entrada

Meus grupos:
  1. Query    PK = LOOKUP#USER#<u>#GROUP                      → groupIds
  2. BatchGet GROUP#<g> + MEMBERSHIP#<g>#<u>                  → grupo e papel

Participa? Com qual papel?
  1. Get      MEMBERSHIP#<g>#<u>                              → role (ou nada)
```

### Escritas, item a item

```
Entrar como reserva (3 itens, todos com attribute_not_exists(PK)):
  Put MEMBERSHIP#<g>#<u> / META            { role: "reserve", createdAt }
  Put LOOKUP#GROUP#<g>#MEMBERSHIP / <u>    { id: <u> }
  Put LOOKUP#USER#<u>#GROUP / <g>          { id: <g> }

Reserva → membro (1 Update, sem tocar nos lookups):
  Update MEMBERSHIP#<g>#<u>  SET role = "member", roleChangedAt = :now  IF role = "reserve"

Remover (até 9 itens):
  Delete MEMBERSHIP#<g>#<u>                IF exists AND role = :roleLido
  Delete LOOKUP#GROUP#<g>#MEMBERSHIP / <u>
  Delete LOOKUP#USER#<u>#GROUP / <g>
  Delete + Put do lookup do token, mais o Update do grupo   IF token = :antigo
  Delete ATTENDANCE#… + 2 lookups da presença              (só se estava na lista do jogo aberto)
```

- Itens por grupo: 1 + 3 tokens + **3 por participante** (hoje são 2). Um grupo com 25 participantes tem 79 itens, contra 54 hoje.
- O IAM não muda: as operações são as mesmas (Get, BatchGet, Query, TransactWrite, Update).
- Riscos: não há partição quente (cada membership é um item próprio) nem item que cresce. A maior transação (remover) tem 9 itens.

## Casos de comportamento

1. **Dado** que o dono cria um grupo, **então** ele aparece como membro e dono na lista, o grupo aparece nos grupos dele e o papel dele é `member`.
2. **Dado** um usuário que entra pelo link de membro, **então** o papel é `member` e o grupo aparece nos grupos dele.
3. **Dado** um usuário que entra pelo link de reserva, **então** o papel é `reserve`.
4. **Dado** um usuário que já é membro e usa o link de membro de novo, **então** nada muda e a resposta tem `myRole: member`.
5. **Dado** um usuário que já é membro e usa o link de **reserva**, **então** ele continua `member` (não rebaixa).
6. **Dado** uma reserva que entra pelo link de membro, **então** o papel vira `member`, a **data de entrada continua a original** e o `roleChangedAt` é gravado.
7. **Dado** duas entradas simultâneas do mesmo usuário pelo mesmo link, **então** fica uma participação só e nenhuma das duas dá erro.
8. **Dado** um usuário em 3 grupos (membro em 2, reserva em 1), **quando** lista os seus grupos, **então** vêm os 3, cada um com o `myRole` certo.
9. **Dado** um usuário sem grupo, **então** a lista de grupos dele vem vazia.
10. **Dado** um grupo com dono, 2 membros e 2 reservas, **quando** lista os membros, **então** vem o dono primeiro, depois os membros e depois as reservas, e dentro de cada papel na ordem de entrada.
11. **Dado** que o dono remove um membro, **então** ele some da lista, o grupo some dos grupos dele, o link de membro é trocado e a presença no jogo aberto é apagada (como hoje).
12. **Dado** que o dono remove um membro que outra requisição já removeu, **então** dá `GROUP_MEMBER_NOT_FOUND`.
13. **Dado** que o dono remove uma reserva enquanto ela é promovida a membro, **quando** a transação falha por causa do papel, **então** o service relê e remove como `member`, trocando o link **de membro**.
14. **Dado** um usuário removido, **quando** ele tenta abrir o grupo, **então** dá `GROUP_NOT_FOUND` (leitura consistente, como hoje).
15. **Dado** um convidado (`/play`) que não participa do grupo, **então** o papel dele é `guest`. **Dado** que ele é membro ou reserva, **então** vem o papel dele.
16. **Dado** uma promoção da fila, **então** a notificação e o papel do promovido funcionam como hoje (`roleOf` continua igual).
17. **Check:** depois deste plano, nenhum `*.table.ts` monta `LOOKUP#GROUP#<g>#MEMBER` nem `#RESERVE`. Se o plano 011 for implementado antes, isso é coberto pelo check do mapa. Se não, por uma busca no review.

## Tarefas

1. **Tabela:** `membership.table.ts` (as chaves de D1 e D3, o `MembershipRecord` e `MEMBERSHIP_ENTITY`), saindo de `group.table.ts` as funções de `#MEMBER` e `#RESERVE`. _Pronto quando:_ o typecheck aponta todos os usos antigos. _Risco:_ baixo.
2. **Repositório:** `create`, `roleOf`, `addMember` (entrada e promoção com 1 Update), `listMembers`, `groupsOf`, `removeMember` (D6). _Pronto quando:_ casos 1–16 passam no service, com o repositório em memória refeito no novo formato. _Risco:_ **o repositório Dynamo não tem teste automático** (fica para o próximo plano, P3): as chaves e as condições dependem da revisão e do roteiro manual.
3. **Service:** o "meus grupos" passa a usar `groupsOf`, e a lista de membros ordena por papel e data de entrada. _Pronto quando:_ casos 8–10 passam. _Risco:_ baixo.
4. **Regra e ADR:** o ADR 0009 ("entidade de relação com chave natural"), a linha no `docs/decisions/README.md` e a ressalva em `.claude/rules/dynamodb.md`. _Pronto quando:_ os textos estão consistentes com a D1. _Risco:_ baixo.
5. **Roteiro manual** no DynamoDB Local: criar grupo, entrar como reserva, promover, remover, e conferir os itens no dynamodb-admin (porta 8001).

## Perguntas que bloqueiam

Respondidas pelo dono em 09/11/2026:

- **P1.** Só há dados de dev → D8, sem script.
- **P2.** Ordem por data de entrada dentro de cada papel → D9.
- **P3.** Testes de repositório contra o DynamoDB Local num plano próprio, logo depois deste.

## Status

- [x] 1. Plano — aprovado (09/11/2026)
- [x] 2. Contrato — sem mudança em `@scorely/contracts`; typecheck verde
- [x] 3. Testes — `groups.service.test.ts` (bloco `plano 013`, casos 1–16) e repositório em memória no formato Membership; caso 17 fica para o review. Falhavam antes da implementação (tsc: `groupsOf`; 27 testes no vitest)
- [x] 4. Implementação — tarefas 1–4 feitas; `npm run check` verde. Ajuste na D7: `listMembers` traz `createdAt` (apontado no passo 3)
- [x] 5. Revisão — aprovado com ressalvas, sem ❌ (`013-membership.review.md`)
- [x] 6. Entrega — staged só o que é deste plano; no README, só a linha do 0009
