import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  setCreatedAtIfNew,
  stripKeys,
  type TransactItem,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import {
  USER_EMAIL_ENTITY,
  USER_ENTITY,
  USER_PREFERENCES_ENTITY,
  userEmailKey,
  userEmailLookupKey,
  userKey,
  userPreferencesKey,
} from '@scorely/api/src/modules/users/user.table';
import type { Me, Preferences, UpdateMeInput, User } from '@scorely/contracts';

/** O que o `update` grava: o PATCH /me. A foto de perfil é gravada pela transação da mídia (USR-08, MID-08). */
export type UserPatch = UpdateMeInput;

/** `consistent`: leitura fortemente consistente (enxerga uma escrita que acabou de acontecer). */
export interface ReadOptions {
  consistent?: boolean;
}

export interface UserRepository {
  /** Só o perfil (`META`): sem email nem preferências (USR-13). */
  get(id: string, opts?: ReadOptions): Promise<User | undefined>;
  /** Perfil + email + preferências: o `GET /me` (USR-13, 14). */
  getMe(id: string, opts?: ReadOptions): Promise<Me | undefined>;
  /** Pelo email (login): a pessoa inteira, como o `getMe`. */
  getByEmail(email: string, opts?: ReadOptions): Promise<Me | undefined>;
  /** Só as preferências (refresh, GRP-13). Sem item → `{}`. */
  getPreferences(id: string): Promise<Preferences>;
  /** Perfil + email + preferências vazias + lookup do email, numa transação. `false` se o email já estiver em uso. */
  create(user: User, email: string): Promise<boolean>;
  /** Cada campo na sua parte (perfil ou preferências), numa transação. `null` remove o atributo (apelido). */
  update(id: string, patch: UserPatch): Promise<Me | undefined>;
}

const PROFILE_FIELDS = ['name', 'nickname', 'gender'] as const;
const PREFERENCE_FIELDS = ['locale', 'timeZone'] as const;

/** Só os campos de preferência de um item (sem chaves, `createdAt`, `updatedAt`). */
function preferencesOf(row: Record<string, unknown> | undefined): Preferences {
  if (!row) return {};
  const { locale, timeZone } = row as Preferences;
  return { ...(locale !== undefined && { locale }), ...(timeZone !== undefined && { timeZone }) };
}

/** `SET`/`REMOVE` dos campos do patch (`null` remove), com os nomes e valores da expressão. */
function updateParts(
  fields: [string, unknown][],
  extraSet: string[] = [],
  extraValues: Record<string, unknown> = {},
) {
  const set = fields.filter(([, v]) => v !== null);
  const remove = fields.filter(([, v]) => v === null);
  const setClauses = [...set.map(([k]) => `#${k} = :${k}`), ...extraSet];
  const expression = [
    setClauses.length > 0 && `SET ${setClauses.join(', ')}`,
    remove.length > 0 && `REMOVE ${remove.map(([k]) => `#${k}`).join(', ')}`,
  ]
    .filter(Boolean)
    .join(' ');
  const values = { ...Object.fromEntries(set.map(([k, v]) => [`:${k}`, v])), ...extraValues };
  return {
    UpdateExpression: expression,
    ExpressionAttributeNames: Object.fromEntries(fields.map(([k]) => [`#${k}`, k])),
    ...(Object.keys(values).length > 0 && { ExpressionAttributeValues: values }),
  };
}

function pick(patch: UserPatch, keys: readonly string[]): [string, unknown][] {
  return Object.entries(patch).filter(([k, v]) => keys.includes(k) && v !== undefined);
}

export const dynamoUserRepository: UserRepository = {
  async get(id, opts) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: userKey(id), ConsistentRead: opts?.consistent }),
    );
    return Item ? stripKeys<User>(Item) : undefined;
  },

  async getMe(id, opts) {
    const rows = await batchGetOrdered([userKey(id), userEmailKey(id), userPreferencesKey(id)], opts);
    const bySk = new Map(rows.map((row) => [row.SK as string, row]));
    const profile = bySk.get('META');
    const email = bySk.get('EMAIL')?.email as string | undefined;
    if (!profile || email === undefined) return undefined;
    return { ...stripKeys<User>(profile), email, preferences: preferencesOf(bySk.get('PREFERENCES')) };
  },

  async getByEmail(email, opts) {
    const { Item: pointer } = await dynamo().send(
      new GetCommand({
        TableName: tableName(),
        Key: userEmailLookupKey(email),
        ProjectionExpression: 'id',
        ConsistentRead: opts?.consistent,
      }),
    );
    return pointer ? dynamoUserRepository.getMe(pointer.id as string, opts) : undefined;
  },

  async getPreferences(id) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: userPreferencesKey(id), ConsistentRead: true }),
    );
    return preferencesOf(Item);
  },

  async create(user, email) {
    const put = (Item: Record<string, unknown>): TransactItem => ({
      Put: { TableName: tableName(), Item, ConditionExpression: 'attribute_not_exists(PK)' },
    });
    const result = await transactWrite([
      put(dbItem(userKey(user.id), USER_ENTITY, user)),
      put(dbItem(userEmailKey(user.id), USER_EMAIL_ENTITY, { email }, user.createdAt)),
      put(
        dbItem(
          userPreferencesKey(user.id),
          USER_PREFERENCES_ENTITY,
          { updatedAt: user.createdAt },
          user.createdAt,
        ),
      ),
      put(dbItem(userEmailLookupKey(email), LOOKUP_ENTITY, { id: user.id }, user.createdAt)),
    ]);
    return result.ok;
  },

  async update(id, patch) {
    const profile = pick(patch, PROFILE_FIELDS);
    const preferences = pick(patch, PREFERENCE_FIELDS);
    const now = new Date();
    const created = setCreatedAtIfNew(now);
    // O índice 0 é sempre o perfil: Update dos campos dele, ou só a conferência de que a pessoa existe.
    const items: TransactItem[] = [
      profile.length > 0
        ? {
            Update: {
              TableName: tableName(),
              Key: userKey(id),
              ConditionExpression: 'attribute_exists(PK)',
              ...updateParts(profile),
            },
          }
        : {
            ConditionCheck: {
              TableName: tableName(),
              Key: userKey(id),
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
      ...(preferences.length > 0
        ? [
            {
              Update: {
                TableName: tableName(),
                Key: userPreferencesKey(id),
                ...updateParts(
                  preferences,
                  ['updatedAt = :updatedAt', 'entity = :entity', created.expression],
                  {
                    ':updatedAt': now.toISOString(),
                    ':entity': USER_PREFERENCES_ENTITY,
                    ...created.values,
                  },
                ),
              },
            },
          ]
        : []),
    ];
    const result = await transactWrite(items);
    if (!result.ok) return undefined;
    return dynamoUserRepository.getMe(id, { consistent: true });
  },
};

/** O que outros módulos leem dos usuários (ex.: nomes na lista do jogo). Só o perfil: nunca o email (USR-13). */
export interface UserDirectory {
  get(id: string): Promise<User | undefined>;
  /** Preferências da pessoa (GRP-13: o fuso padrão do grupo novo). */
  getPreferences(id: string): Promise<Preferences>;
  /** Vários de uma vez (BatchGet), na ordem dos ids; os que não existem somem. */
  getMany(ids: readonly string[]): Promise<User[]>;
}

export const dynamoUserDirectory: UserDirectory = {
  get: (id) => dynamoUserRepository.get(id),
  getPreferences: (id) => dynamoUserRepository.getPreferences(id),
  async getMany(ids) {
    const rows = await batchGetOrdered([...new Set(ids)].map(userKey));
    return rows.map((row) => stripKeys<User>(row));
  },
};
