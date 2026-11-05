---
paths:
  - "apps/*/api/src/**/*.repository.ts"
  - "apps/*/api/src/lib/db.ts"
  - "apps/*/api/src/lib/dynamo.ts"
  - "apps/*/api/src/lib/entity.ts"
  - "infra/shared/**"
---

# DynamoDB: single-table, SEM GSI

Motivo: [docs/decisions/0002-single-table-sem-gsi.md](../../docs/decisions/0002-single-table-sem-gsi.md).

**Não crie GSI nem LSI** (check: `checks/dynamodb.test.ts`). Cada projeto tem a própria tabela, `<projeto>-<stage>`, só com `PK`/`SK` (`infra/shared/single-table.ts`). Para buscar por qualquer campo que não seja o id, use **lookups** (itens ponteiro).

- **Entidade**: `PK=<ENTIDADE>#<id>`, `SK=META`, com todos os atributos.
- **Lookup**: guarda **só o `id`** da entidade, nunca uma cópia dos dados. Toda busca tem duas etapas: lê o lookup, pega o `id` e busca a entidade pela chave.

| Caso                                     | Chave do lookup                                     | Leitura                                                                                                       |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Busca única (ex.: user por email)        | `PK=LOOKUP#USER#EMAIL#<email>`, `SK=META`, `{ id }` | `GetItem` no lookup → `GetItem` em `USER#<id>`                                                                |
| Listagem/ordenação (ex.: items por data) | `PK=LOOKUP#ITEM`, `SK=<createdAt>#<id>`, `{ id }`   | `Query` no lookup → `BatchGetItem` pelos ids (lotes de 100, tentar de novo `UnprocessedKeys`, manter a ordem) |

## Regras

- Grave a entidade e **todos** os lookups dela na mesma `TransactWriteItems`. Nunca escritas soltas.
- Valor único (email, slug, ...): `ConditionExpression: 'attribute_not_exists(PK)'` no `Put` do lookup.
- Mudou um campo com lookup: na mesma transação, `Delete` do lookup antigo e `Put` do novo.
- Removeu a entidade: apague os lookups dela na mesma transação.
- Normalize o valor usado na chave (ex.: email em minúsculas e sem espaços).
- **Todo item tem `createdAt`** (ISO 8601 em UTC, `...Z`): entidade, lookup, contador. No scorely:
  - Entidade nasce com `newEntity<T>(data, now())` (`api/src/lib/entity.ts`), que gera `id` e `createdAt`. Não monte nenhum dos dois na mão.
  - Schema de entidade nos contracts estende `EntitySchema`: `EntitySchema.extend({...})`.
  - Todo `Put` usa `dbItem(keys, entity, data, createdAt?)` (`api/src/lib/db.ts`). Nos lookups da mesma transação, passe o `createdAt` da entidade.
  - Item criado por `Update` (upsert, ex.: `INBOX`) inclui `setCreatedAtIfNew()` no `SET`.
- Marque cada item com `entity` (`'Item'`, `'User'`, `'Lookup'`, ...). Remova `PK`, `SK` e `entity` antes de devolver (`toItem` no base, `stripKeys` no scorely, que também remove `ttl`).
- Item que expira (códigos, sessões, convites): grave `ttl` (epoch em segundos, via `ttlFrom`) **e** um `expiresAt` que o código confere ao ler. O TTL do DynamoDB atrasa até ~48h. Motivo: [0004](../../docs/decisions/0004-ttl-com-expiresat.md).
- Contadores (ex.: não lidas) ficam em item próprio (`PK=INBOX#<userId>`) e mudam com `ADD` na mesma transação da entidade.
- Operação nova do DynamoDB: adicione a permissão no IAM em `apps/<projeto>/api/serverless.ts`. Check: `checks/dynamodb.test.ts` (Command × IAM).

Implementação de referência: `apps/base/api/src/modules/items/item.repository.ts`.
