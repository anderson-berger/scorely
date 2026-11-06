import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { UpdateMeInput, User } from '@scorely/contracts';
import {
  batchGetOrdered,
  dbItem,
  isConditionFailed,
  LOOKUP_ENTITY,
  stripKeys,
  transactWrite,
} from '../../lib/db';
import { dynamo, tableName } from '../../lib/dynamo';
import { USER_ENTITY, userEmailLookupKey, userKey } from './user.table';

/** `consistent`: leitura fortemente consistente (enxerga uma escrita que acabou de acontecer). */
export interface ReadOptions {
  consistent?: boolean;
}

export interface UserRepository {
  get(id: string, opts?: ReadOptions): Promise<User | undefined>;
  getByEmail(email: string, opts?: ReadOptions): Promise<User | undefined>;
  /** Cria o usuário e o lookup de email. Devolve `false` se o email já estiver em uso. */
  create(user: User): Promise<boolean>;
  update(id: string, patch: UpdateMeInput): Promise<User | undefined>;
}

export const dynamoUserRepository: UserRepository = {
  async get(id, opts) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: userKey(id), ConsistentRead: opts?.consistent }),
    );
    return Item ? stripKeys<User>(Item) : undefined;
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
    return pointer ? this.get(pointer.id as string, opts) : undefined;
  },

  async create(user) {
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(userKey(user.id), USER_ENTITY, user),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(userEmailLookupKey(user.email), LOOKUP_ENTITY, { id: user.id }, user.createdAt),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
    return result.ok;
  },

  async update(id, patch) {
    const set: string[] = [];
    const remove: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(patch)) {
      names[`#${field}`] = field;
      if (value === null) remove.push(`#${field}`);
      else {
        set.push(`#${field} = :${field}`);
        values[`:${field}`] = value;
      }
    }
    const expression = [set.length && `SET ${set.join(', ')}`, remove.length && `REMOVE ${remove.join(', ')}`]
      .filter(Boolean)
      .join(' ');
    try {
      const { Attributes } = await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: userKey(id),
          UpdateExpression: expression,
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeNames: names,
          ...(Object.keys(values).length && { ExpressionAttributeValues: values }),
          ReturnValues: 'ALL_NEW',
        }),
      );
      return Attributes ? stripKeys<User>(Attributes) : undefined;
    } catch (err) {
      if (isConditionFailed(err)) return undefined;
      throw err;
    }
  },
};

/** O que outros módulos leem dos usuários (ex.: nomes na lista do jogo). */
export interface UserDirectory {
  get(id: string): Promise<User | undefined>;
  /** Vários de uma vez (BatchGet), na ordem dos ids; os que não existem somem. */
  getMany(ids: readonly string[]): Promise<User[]>;
}

export const dynamoUserDirectory: UserDirectory = {
  get: (id) => dynamoUserRepository.get(id),
  async getMany(ids) {
    const rows = await batchGetOrdered([...new Set(ids)].map(userKey));
    return rows.map((row) => stripKeys<User>(row));
  },
};
