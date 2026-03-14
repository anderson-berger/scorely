# Match Module — AI Reference

## Types

```ts
// match_types.ts
type Match = {
  id: string
  version: number
  sport: "FOOTBALL" | "FUTSAL" | "SOCIETY" | "BASKETBALL" | "VOLLEYBALL"
  createdBy: string        // userId
  date: string             // ISO datetime
  locationId?: string      // uuid
  maxPlayers: number
  status: "OPEN" | "FULL" | "IN_PROGRESS" | "FINISHED" | "CANCELLED"
  visibility: "PUBLIC" | "PRIVATE"
  createdAt: string
  updatedAt: string
  deletedAt?: string       // soft delete
}

type NewMatch = Pick<Match, "sport" | "date" | "locationId" | "maxPlayers" | "visibility">

// match_user_types.ts
type MatchUser = {
  id: string
  version: number
  userId: string
  matchId: string
  role: "OWNER" | "ADMIN" | "MEMBER"
  status: "INVITED" | "CONFIRMED" | "DECLINED" | "LEFT"
  createdAt: string
  updatedAt: string
  deletedAt?: string       // soft delete
}

type NewMatchUser = Pick<MatchUser, "userId" | "matchId" | "role" | "status">
```

---

## Schemas (Zod) — match_schemas.ts

```ts
$match          // full Match entity
$newMatch       // HTTP body for POST /matches — omits: id, version, createdBy, status, createdAt, updatedAt, deletedAt
```

## Schemas (Zod) — match_user_schemas.ts

```ts
$matchUser                  // full MatchUser entity
$newMatchUser               // omits: id, version, createdAt, updatedAt, deletedAt
$addMatchMemberBody         // { userId }  — picked from $matchUser
$updateMatchMemberRoleBody  // { role }    — picked from $matchUser
```

---

## Services

### MatchService — match_service.ts
```ts
findById(id)                          → Match | null
findByIds(ids[])                      → Match[]
create(input: NewMatch, createdBy)    → Match        // sets status="OPEN"
delete(id)                            → void         // soft delete
```

### MatchUserService — member/user/match_user_service.ts
```ts
create(newMatchUser: NewMatchUser)                    → MatchUser
findById(matchId, matchUserId)                        → MatchUser | null
findByMatchId(matchId, query)                         → PaginatedResult<MatchUser>
findByMatchAndUser(matchId, userId)                   → MatchUser | null
matchUserListByUserId(userId, query)                  → PaginatedResult<MatchUser>
updateRole(matchId, matchUserId, role)                → MatchUser
delete(matchId, matchUserId)                          → void   // soft delete
deleteAllByMatchId(matchId)                           → void   // soft delete all
```

---

## Use Cases

| Class | File | Logic |
|---|---|---|
| `CreateMatchUseCase` | use-cases/CreateMatchUseCase.ts | Creates Match + MatchUser(OWNER, CONFIRMED) |
| `FindMyMatchesUseCase` | use-cases/FindMyMatchesUseCase.ts | Lists MatchUsers by userId via GSI1, BatchGet matches |
| `GetMatchUseCase` | use-cases/GetMatchUseCase.ts | findById match + findByMatchAndUser for requester |
| `DeleteMatchUseCase` | use-cases/DeleteMatchUseCase.ts | Guards OWNER, deleteAllByMatchId, delete match |
| `AddMatchMemberUseCase` | use-cases/AddMatchMemberUseCase.ts | Guards OWNER/ADMIN, creates MatchUser(MEMBER, INVITED) |
| `RemoveMatchMemberUseCase` | use-cases/RemoveMatchMemberUseCase.ts | Guards OWNER/ADMIN or self, blocks OWNER removal |
| `UpdateMatchMemberRoleUseCase` | use-cases/UpdateMatchMemberRoleUseCase.ts | Guards OWNER only, blocks OWNER role change or promotion to OWNER |

---

## Endpoints & Handlers

### match_handlers.ts
```
POST   /api/matches        create       → parseRequestBody → $newMatch.parse → CreateMatchUseCase
GET    /api/matches/my     findMyMatches→ $paginationQuery → FindMyMatchesUseCase
GET    /api/matches/{id}   getById      → GetMatchUseCase
DELETE /api/matches/{id}   remove       → DeleteMatchUseCase
```

### match_member_handlers.ts
```
GET    /api/matches/{id}/members                list        → matchUserService.findByMatchId
POST   /api/matches/{id}/members                add         → $addMatchMemberBody.parse → AddMatchMemberUseCase
PATCH  /api/matches/{id}/members/{memberId}     updateRole  → $updateMatchMemberRoleBody.parse → UpdateMatchMemberRoleUseCase
DELETE /api/matches/{id}/members/{memberId}     remove      → RemoveMatchMemberUseCase
```

---

## DynamoDB Keys

| Entity | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Match | `MATCH_{id}` | `MATCH` | `MATCHES` | `MATCH_{createdAt}` |
| MatchUser | `MATCH_{matchId}` | `MATCH_USER_{id}` | `USER_{userId}` | `MATCH_USER_{createdAt}_{id}` |

**Access patterns:**
- Match by id → `GetItem PK=MATCH_{id} SK=MATCH`
- Match by ids → `BatchGet`
- Members of a match → `Query PK=MATCH_{matchId}, SK begins_with MATCH_USER_`
- Member by matchId + userId → `Query PK + FilterExpression data.userId`
- Matches of a user → `Query GSI1 GSI1PK=USER_{userId}, GSI1SK begins_with MATCH_USER_`

**Soft delete filter:** all queries use `FilterExpression: attribute_not_exists(#data.#deletedAt)`

---

## Business Rules

- Match is created with `status: "OPEN"`
- Creator gets `role: "OWNER"`, `status: "CONFIRMED"` automatically
- Added members get `role: "MEMBER"`, `status: "INVITED"`
- Only OWNER can delete match or change member roles
- OWNER cannot be removed or have role changed
- Cannot promote to OWNER via updateRole
- Deleting a match soft-deletes all MatchUsers first

---

## Serverless Functions — serverless/functions/match.ts

```
matchCreate          POST   /api/matches
matchFindMy          GET    /api/matches/my
matchGetById         GET    /api/matches/{id}
matchDelete          DELETE /api/matches/{id}
matchMemberList      GET    /api/matches/{id}/members
matchMemberAdd       POST   /api/matches/{id}/members
matchMemberUpdateRole PATCH /api/matches/{id}/members/{memberId}
matchMemberRemove    DELETE /api/matches/{id}/members/{memberId}
```
