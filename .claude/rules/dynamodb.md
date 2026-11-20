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
- **Item que pertence a uma entidade** (dados à parte, contadores, extensões, segredos): fica na partição dela, `PK=<ENTIDADE>#<id>`, `SK=<O QUE É>` (ex.: `USER#<u>/PRIVATE`, `GROUP#<g>/INVITES`, `GROUP#<g>/COMPETITION`). O `META` é sempre lido por GetItem, nunca pela partição inteira. Segredo (token, email) nunca fica no `META`. Motivo: [0014](../../docs/decisions/0014-itens-do-grupo-na-particao-do-grupo.md).
- **Entidade de relação** (N:N, sem identidade além do par, ex.: a participação): chave natural, sem `id` e sem `newEntity`, mas com `createdAt` e `dbItem`. Ela mora na partição da ponta que lista (`GROUP#<g>/MEMBER#<u>`): "os X da entidade" é uma Query nessa partição, sem lookup; a outra direção tem o seu lookup (`LOOKUP#USER#<u>#GROUP`). Motivo: [0009](../../docs/decisions/0009-entidade-de-relacao-chave-natural.md), [0014](../../docs/decisions/0014-itens-do-grupo-na-particao-do-grupo.md).
- **Lookup**: guarda **só o `id`** da entidade, nunca uma cópia dos dados. Toda busca tem duas etapas: lê o lookup, pega o `id` e busca a entidade pela chave.

| Caso                                     | Chave do lookup                                     | Leitura                                                                                                       |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Busca única (ex.: user por email)        | `PK=LOOKUP#USER#EMAIL#<email>`, `SK=META`, `{ id }` | `GetItem` no lookup → `GetItem` em `USER#<id>`. Vários de uma vez (ex.: ids públicos, `LOOKUP#USER#PUBLIC#<publicId>`): `BatchGetItem` |
| Listagem/ordenação (ex.: items por data) | `PK=LOOKUP#ITEM`, `SK=<createdAt>#<id>`, `{ id }`   | `Query` no lookup → `BatchGetItem` pelos ids (lotes de 100, tentar de novo `UnprocessedKeys`, manter a ordem) |

## Regras

- Grave a entidade e **todos** os lookups dela na mesma `TransactWriteItems`. Nunca escritas soltas.
- Valor único (email, slug, ...): `ConditionExpression: 'attribute_not_exists(PK)'` no `Put` do lookup.
- Mudou um campo com lookup: na mesma transação, `Delete` do lookup antigo e `Put` do novo.
- Removeu a entidade: apague os lookups dela na mesma transação.
- Normalize o valor usado na chave (ex.: email em minúsculas e sem espaços).
- **Todo item tem `createdAt`** (ISO 8601 em UTC, `...Z`): entidade, lookup, contador. No scorely:
  - Entidade nasce com `newEntity<T>(data, now())` (`api/src/lib/entity.ts`), que gera `id` e `createdAt`. Não monte nenhum dos dois na mão.
  - Schema de entidade nos contracts estende `EntitySchema`: `EntitySchema.extend({...})`. Exceção: o `UserSchema`, cujo `id` é o público (USR-16, ADR 0011); o item do banco continua com o `id` do sistema e o `publicId`.
  - Todo `Put` usa `dbItem(keys, entity, data, createdAt?)` (`api/src/lib/db.ts`). Nos lookups da mesma transação, passe o `createdAt` da entidade.
  - Item criado por `Update` (upsert, ex.: `INBOX`) inclui `setCreatedAtIfNew()` no `SET`.
- **Toda entidade tem `updatedAt` e `version`** (scorely, [ADR 0013](../../docs/decisions/0013-version-e-updatedat.md)): nasce com `updatedAt = createdAt` e `version = 1` (o `dbItem` põe os dois); toda alteração grava `updatedAt` e soma 1 na `version` (`ADD version :one`), pelo helper de alteração do `db.ts`. Substituir o item inteiro não é `Put` (a `version` voltaria a 1): use o `replaceItem` do `db.ts`, que vira um `Update` com todos os campos e apaga os opcionais ausentes. Lookups, contadores, os itens do auth (código de login e sessão) e a parte privada e as preferências do usuário (`USER#<id> / PRIVATE` e `PREFERENCES`: a `version` da pessoa é a do `META`) ficam de fora (`NOT_ENTITIES` no `db.ts`): sem `updatedAt` nem `version`, mas com `createdAt`.
- **Edição confere a `version`** ([ADR 0016](../../docs/decisions/0016-version-confere-nas-edicoes.md)): toda escrita de edição recebe a `expectedVersion` que a tela mostrou e grava só se ela for a atual, com o `withVersion(update, expected)` do `db.ts` (`version = :expectedVersion`; com `0`, `attribute_not_exists(PK)`: o item ainda não existe). Falhou: `sendVersioned` (ou `versionConflict` numa transação) lança `VERSION_CONFLICT` com a `currentVersion` relida. Quem confere é o repositório, na gravação; o service só repassa. Entrar, sair, confirmar e outras disputas por lugar não usam versão: um contador com condição garante o limite.
- Mídia: o item da área guarda só `<field>MediaId`; nunca grave URL no banco. A URL é montada na resposta (MID-12).
- Marque cada item com `entity` (`'Item'`, `'User'`, `'Lookup'`, ...). Remova `PK`, `SK` e `entity` antes de devolver (`toItem` no base, `stripKeys` no scorely, que também remove `ttl` e mantém `updatedAt` e `version` na resposta, ADR 0013).
- Item que expira (códigos, sessões, convites): grave `ttl` (epoch em segundos, via `ttlFrom`) **e** um `expiresAt` que o código confere ao ler. O TTL do DynamoDB atrasa até ~48h. Motivo: [0004](../../docs/decisions/0004-ttl-com-expiresat.md).
- Contadores (ex.: não lidas) ficam em item próprio (`PK=INBOX#<userId>`) e mudam com `ADD` na mesma transação da entidade.
- Operação nova do DynamoDB: adicione a permissão no IAM em `apps/<projeto>/api/serverless.ts`. Check: `checks/dynamodb.test.ts` (Command × IAM).

Implementação de referência: `apps/base/api/src/modules/items/item.repository.ts`.
