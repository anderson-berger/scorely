# Módulo Match

## O que é uma Match?

Uma **Match** representa uma **partida esportiva** organizada por um usuário dentro da plataforma Scorely.

O criador da partida se torna automaticamente o **OWNER** e pode convidar outros usuários, gerenciar membros e controlar o ciclo de vida da partida.

---

## Entidades

### Match

Representa a partida em si.

| Campo        | Tipo                                                        | Descrição                                      |
|--------------|-------------------------------------------------------------|------------------------------------------------|
| `id`         | `string (uuid)`                                             | Identificador único                            |
| `version`    | `number`                                                    | Controle de versão para atualizações           |
| `sport`      | `FOOTBALL \| FUTSAL \| SOCIETY \| BASKETBALL \| VOLLEYBALL` | Modalidade esportiva                           |
| `createdBy`  | `string (uuid)`                                             | ID do usuário que criou a partida              |
| `date`       | `string (datetime)`                                         | Data e hora da partida                         |
| `locationId` | `string (uuid)?`                                            | Local da partida (opcional)                    |
| `maxPlayers` | `number`                                                    | Número máximo de jogadores                     |
| `status`     | `OPEN \| FULL \| IN_PROGRESS \| FINISHED \| CANCELLED`      | Estado atual da partida                        |
| `visibility` | `PUBLIC \| PRIVATE`                                         | Visibilidade para outros usuários              |
| `createdAt`  | `string (datetime)`                                         | —                                              |
| `updatedAt`  | `string (datetime)`                                         | —                                              |
| `deletedAt`  | `string (datetime)?`                                        | Preenchido no soft delete, `null` = ativo      |

**Status da partida:**
- `OPEN` — criada, aceitando membros
- `FULL` — número máximo de confirmados atingido
- `IN_PROGRESS` — partida em andamento
- `FINISHED` — partida encerrada
- `CANCELLED` — partida cancelada

---

### MatchUser

Representa o **vínculo de um usuário com uma partida**. Todo usuário precisa ter um `MatchUser` para participar de uma `Match`.

| Campo       | Tipo                                        | Descrição                                 |
|-------------|---------------------------------------------|-------------------------------------------|
| `id`        | `string (uuid)`                             | Identificador único do vínculo            |
| `version`   | `number`                                    | Controle de versão                        |
| `userId`    | `string (uuid)`                             | ID do usuário                             |
| `matchId`   | `string (uuid)`                             | ID da partida                             |
| `role`      | `OWNER \| ADMIN \| MEMBER`                  | Papel do usuário na partida               |
| `status`    | `INVITED \| CONFIRMED \| DECLINED \| LEFT`  | Estado da participação                    |
| `createdAt` | `string (datetime)`                         | —                                         |
| `updatedAt` | `string (datetime)`                         | —                                         |
| `deletedAt` | `string (datetime)?`                        | Preenchido no soft delete, `null` = ativo |

**Roles:**
- `OWNER` — criador da partida, permissões totais
- `ADMIN` — pode adicionar/remover membros
- `MEMBER` — participante comum

**Status do membro:**
- `INVITED` — convidado, ainda não confirmou
- `CONFIRMED` — confirmou presença
- `DECLINED` — recusou o convite
- `LEFT` — saiu da partida

---

## Regras de negócio

| Ação                  | Quem pode                                           |
|-----------------------|-----------------------------------------------------|
| Criar partida         | Qualquer usuário autenticado                        |
| Ver partida           | Qualquer usuário autenticado                        |
| Deletar partida       | Apenas `OWNER`                                      |
| Listar membros        | Qualquer usuário autenticado                        |
| Adicionar membro      | `OWNER` ou `ADMIN`                                  |
| Remover membro        | `OWNER`, `ADMIN`, ou o próprio membro saindo        |
| Alterar role          | Apenas `OWNER`                                      |
| Role `OWNER` protegida| Não pode ser removido nem ter role alterada         |
| Promoção a `OWNER`    | Não permitida via `updateRole`                      |

**Ao criar uma partida:**
- A partida nasce com `status: "OPEN"`
- O criador recebe `role: "OWNER"` e `status: "CONFIRMED"` automaticamente

**Ao adicionar um membro:**
- Novo membro recebe `role: "MEMBER"` e `status: "INVITED"`

**Soft delete:**
- Nenhum dado é apagado fisicamente do banco
- Ao deletar uma partida, todos os `MatchUser`s são soft-deletados antes da partida
- Registros com `deletedAt` preenchido são invisíveis em todas as queries

---

## Endpoints

### Partida

| Método   | Path                | Descrição                        | Auth |
|----------|---------------------|----------------------------------|------|
| `POST`   | `/api/matches`      | Criar partida                    | ✓    |
| `GET`    | `/api/matches/my`   | Listar minhas partidas (paginado) | ✓   |
| `GET`    | `/api/matches/{id}` | Buscar partida por ID            | ✓    |
| `DELETE` | `/api/matches/{id}` | Deletar partida (soft delete)    | ✓    |

**Body do `POST /api/matches`:**
```json
{
  "sport": "FOOTBALL",
  "date": "2026-04-01T19:00:00Z",
  "locationId": "uuid-opcional",
  "maxPlayers": 10,
  "visibility": "PUBLIC"
}
```

### Membros

| Método   | Path                                    | Descrição                      | Auth |
|----------|-----------------------------------------|--------------------------------|------|
| `GET`    | `/api/matches/{id}/members`             | Listar membros (paginado)      | ✓    |
| `POST`   | `/api/matches/{id}/members`             | Convidar membro                | ✓    |
| `PATCH`  | `/api/matches/{id}/members/{memberId}`  | Alterar role do membro         | ✓    |
| `DELETE` | `/api/matches/{id}/members/{memberId}`  | Remover membro                 | ✓    |

---

## Arquitetura do módulo

```
match/
├── match_schemas.ts              # Schemas Zod: $match, $newMatch
├── match_types.ts                # Types TS: Match, NewMatch
├── match_service.ts              # Operações sobre Match
├── match_handlers.ts             # Handlers HTTP de partida
├── match_member_handlers.ts      # Handlers HTTP de membros
├── repositories/
│   └── MatchRepository.ts        # DynamoDB: Match
├── use-cases/
│   ├── CreateMatchUseCase.ts
│   ├── FindMyMatchesUseCase.ts
│   ├── GetMatchUseCase.ts
│   ├── DeleteMatchUseCase.ts
│   ├── AddMatchMemberUseCase.ts
│   ├── RemoveMatchMemberUseCase.ts
│   └── UpdateMatchMemberRoleUseCase.ts
└── member/user/
    ├── match_user_schemas.ts     # Schemas Zod: $matchUser, $newMatchUser, inputs HTTP
    ├── match_user_types.ts       # Types TS: MatchUser, NewMatchUser
    ├── match_user_service.ts     # Operações sobre MatchUser
    └── repositories/
        └── match_user_repository.ts  # DynamoDB: MatchUser
```
