import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  currentVersion,
  dbItem,
  LOOKUP_ENTITY,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  versionConflict,
  withVersion,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import {
  USER_ENTITY,
  USER_PREFERENCES_ENTITY,
  USER_PRIVATE_ENTITY,
  userEmailLookupKey,
  userKey,
  userPreferencesKey,
  userPrivateKey,
  userPublicIdLookupKey,
} from '@scorely/api/src/modules/users/user.table';
import type { Preferences, Private, PublicUserId, UpdateMeInput, User } from '@scorely/contracts';

/**
 * O perfil como fica no banco (`META`): `id` é o id do sistema, `publicId` o código de amigo (USR-15) e
 * `avatarMediaId` a mídia da foto (USR-08; a URL é montada na resposta, MID-12). Sem email nem nome (USR-13).
 * Interno da api: a resposta sai pelo `toMe`/`publicId`.
 */
export type UserRecord = Omit<User, 'id' | 'avatarUrl'> & {
  id: UserId;
  publicId: PublicUserId;
  avatarMediaId?: string;
  /** USR-18: a versão do perfil, que o `PATCH /me` manda (ADR 0013, 0016). */
  version: number;
};
/** A própria pessoa como fica no banco: perfil + parte privada (email e nome) + preferências (USR-13, 14). */
export type MeRecord = UserRecord & { private: Private; preferences: Preferences };
/** Resultado da criação: o lookup de email ou o do id público já existia. */
export type CreateUserResult = 'created' | 'email_taken' | 'public_id_taken';

/** O que o `update` grava: o PATCH /me. A foto de perfil é gravada pela transação da mídia (USR-08, MID-08). */
export type UserPatch = UpdateMeInput;

/** `consistent`: leitura fortemente consistente (enxerga uma escrita que acabou de acontecer). */
export interface ReadOptions {
  consistent?: boolean;
}

export interface UserRepository {
  /** Só o perfil (`META`): sem email nem preferências (USR-13). */
  get(id: UserId, opts?: ReadOptions): Promise<UserRecord | undefined>;
  /** Perfil + parte privada + preferências: o `GET /me` (USR-13, 14). */
  getMe(id: UserId, opts?: ReadOptions): Promise<MeRecord | undefined>;
  /** Pelo email (login): a pessoa inteira, como o `getMe`. */
  getByEmail(email: string, opts?: ReadOptions): Promise<MeRecord | undefined>;
  /** Só as preferências (refresh, USR-14). Sem item → `{}`. */
  getPreferences(id: UserId): Promise<Preferences>;
  /** Perfil + parte privada + preferências vazias + lookups do email e do id público, numa transação (USR-15). */
  create(user: UserRecord, email: string): Promise<CreateUserResult>;
  /** Cada campo na sua parte (perfil, privado ou preferências), numa transação. */
  update(id: UserId, patch: UserPatch): Promise<MeRecord | undefined>;
  /** USR-17: ids públicos → ids do sistema. Só os encontrados entram no mapa. */
  resolve(publicIds: readonly PublicUserId[]): Promise<Map<PublicUserId, UserId>>;
}

const PROFILE_FIELDS = ['nickname', 'gender'] as const;

/** Só os campos de preferência de um item (sem chaves nem `createdAt`). */
function preferencesOf(row: Record<string, unknown> | undefined): Preferences {
  if (!row) return {};
  const { locale, timeZone } = row as Preferences;
  return { ...(locale !== undefined && { locale }), ...(timeZone !== undefined && { timeZone }) };
}

/** `SET` dos campos do patch, com os nomes e valores da expressão (nenhum campo do `UpdateMeInput` aceita `null`). */
function updateParts(fields: [string, unknown][]) {
  return {
    UpdateExpression: `SET ${fields.map(([k]) => `#${k} = :${k}`).join(', ')}`,
    ExpressionAttributeNames: Object.fromEntries(fields.map(([k]) => [`#${k}`, k])),
    ExpressionAttributeValues: Object.fromEntries(fields.map(([k, v]) => [`:${k}`, v])),
  };
}

/** Altera um item da pessoa que não é entidade (`PRIVATE`, `PREFERENCES`): sem `updatedAt` nem `version` (ADR 0013). */
function updatePart(Key: Record<string, string>, fields: [string, unknown][]): TransactItem[] {
  if (fields.length === 0) return [];
  return [
    {
      Update: {
        TableName: tableName(),
        Key,
        ConditionExpression: 'attribute_exists(PK)',
        ...updateParts(fields),
      },
    },
  ];
}

/** Os campos definidos de um objeto, como pares para o `SET`. */
function definedFields(group: object | undefined): [string, unknown][] {
  return Object.entries(group ?? {}).filter(([, v]) => v !== undefined);
}

function pick(patch: UserPatch, keys: readonly string[]): [string, unknown][] {
  return definedFields(Object.fromEntries(Object.entries(patch).filter(([k]) => keys.includes(k))));
}

export const dynamoUserRepository: UserRepository = {
  async get(id, opts) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: userKey(id), ConsistentRead: opts?.consistent }),
    );
    return Item ? stripKeys<UserRecord>(Item) : undefined;
  },

  async getMe(id, opts) {
    const rows = await batchGetOrdered([userKey(id), userPrivateKey(id), userPreferencesKey(id)], opts);
    const bySk = new Map(rows.map((row) => [row.SK as string, row]));
    const profile = bySk.get('META');
    const priv = bySk.get('PRIVATE');
    const email = priv?.email as string | undefined;
    if (!profile || email === undefined) return undefined;
    const name = priv?.name as string | undefined;
    return {
      ...stripKeys<UserRecord>(profile),
      private: { email, ...(name !== undefined && { name }) },
      preferences: preferencesOf(bySk.get('PREFERENCES')),
    };
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
    return pointer ? dynamoUserRepository.getMe(asUserId(pointer.id as string), opts) : undefined;
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
    // A ordem importa: o índice que falhou diz qual lookup já existia (3 = email, 4 = id público).
    // USR-13, 14: a parte privada nasce só com o email (o nome vem pelo PATCH /me) e as preferências, vazias.
    const result = await transactWrite([
      put(dbItem(userKey(user.id), USER_ENTITY, user)),
      put(dbItem(userPrivateKey(user.id), USER_PRIVATE_ENTITY, { email }, user.createdAt)),
      put(dbItem(userPreferencesKey(user.id), USER_PREFERENCES_ENTITY, {}, user.createdAt)),
      put(dbItem(userEmailLookupKey(email), LOOKUP_ENTITY, { id: user.id }, user.createdAt)),
      put(dbItem(userPublicIdLookupKey(user.publicId), LOOKUP_ENTITY, { id: user.id }, user.createdAt)),
    ]);
    if (result.ok) return 'created';
    // O id do sistema é um uuid novo: só os lookups podem colidir. Email tem prioridade (relê o vencedor).
    return result.failed.includes(4) && !result.failed.includes(3) ? 'public_id_taken' : 'email_taken';
  },

  async update(id, patch) {
    const profile = pick(patch, PROFILE_FIELDS);
    const privateFields = definedFields(patch.private);
    const preferences = definedFields(patch.preferences);
    // O índice 0 é sempre o perfil: toda mudança soma 1 na versão dele (USR-18), com a condição da versão que a tela
    // mostrou, mesmo quando só o nome ou as preferências mudam. A parte privada e as preferências não têm versão.
    const items: TransactItem[] = [
      {
        Update: withVersion(
          touch(
            {
              TableName: tableName(),
              Key: userKey(id),
              ConditionExpression: 'attribute_exists(PK)',
              ...(profile.length > 0 && updateParts(profile)),
            },
            new Date(),
          ),
          patch.version,
        ),
      },
      ...updatePart(userPrivateKey(id), privateFields),
      ...updatePart(userPreferencesKey(id), preferences),
    ];
    const result = await transactWrite(items);
    if (!result.ok) {
      if (!result.failed.includes(0)) return undefined;
      // A conta sumiu (AUTH-16) ou o perfil mudou antes (USR-18).
      const current = await currentVersion(userKey(id));
      if (current === 0) return undefined;
      throw await versionConflict(async () => current);
    }
    return dynamoUserRepository.getMe(id, { consistent: true });
  },

  async resolve(publicIds) {
    const unique = [...new Set(publicIds)];
    const rows = await batchGetOrdered(unique.map(userPublicIdLookupKey));
    const byPk = new Map(rows.map((row) => [row.PK as string, asUserId(row.id as string)]));
    return new Map(
      unique.flatMap((code) => {
        const id = byPk.get(userPublicIdLookupKey(code).PK);
        return id === undefined ? [] : [[code, id] as const];
      }),
    );
  },
};

/** O que outros módulos leem dos usuários (ex.: os perfis dos membros do grupo). Só o perfil: nunca o email (USR-13). */
export interface UserDirectory {
  get(id: UserId): Promise<UserRecord | undefined>;
  /** Vários de uma vez (BatchGet), na ordem dos ids; os que não existem somem. */
  getMany(ids: readonly UserId[]): Promise<UserRecord[]>;
  /** USR-17: ids públicos da entrada → ids do sistema; os desconhecidos ficam de fora. */
  resolve(publicIds: readonly PublicUserId[]): Promise<Map<PublicUserId, UserId>>;
}

export const dynamoUserDirectory: UserDirectory = {
  get: (id) => dynamoUserRepository.get(id),
  async getMany(ids) {
    const rows = await batchGetOrdered([...new Set(ids)].map(userKey));
    return rows.map((row) => stripKeys<UserRecord>(row));
  },
  resolve: (publicIds) => dynamoUserRepository.resolve(publicIds),
};
