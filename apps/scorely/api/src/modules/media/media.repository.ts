import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dbItem, stripKeys, type TransactItem, transactWrite, ttlFrom } from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import {
  MEDIA_ENTITY,
  type MediaRecord,
  type MediaTarget,
  mediaKey,
  targetFields,
} from '@scorely/api/src/modules/media/media.table';

type TargetRef = Pick<MediaTarget, 'key' | 'field'>;

export interface MediaRepository {
  /** Leitura consistente. */
  get(id: string): Promise<MediaRecord | undefined>;
  /** Mídia pendente, com `ttl` do `expiresAt` (MID-04, MID-13). */
  createPending(media: MediaRecord): Promise<void>;
  /**
   * Uma transação (MID-08): grava a mídia pronta (condição: estava pendente), liga na área (condição:
   * `<field>MediaId` = `previous?.id`, ou ausente) e apaga `previous`. Condição falhou → `conflict`.
   */
  attach(input: {
    ready: MediaRecord;
    url: string;
    target: TargetRef;
    previous?: MediaRecord;
  }): Promise<'attached' | 'conflict'>;
  /** Uma transação: remove `<field>MediaId`/`<field>Url` da área (condição: = `previous.id`) e apaga `previous`. */
  detach(input: { target: TargetRef; previous: MediaRecord }): Promise<'detached' | 'conflict'>;
}

/** O id ligado na área precisa ser o lido (`expected`); sem `expected`, o campo precisa estar ausente. */
function areaCondition(expected: string | undefined) {
  return expected
    ? { ConditionExpression: 'attribute_exists(PK) AND #id = :expected', values: { ':expected': expected } }
    : { ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(#id)', values: {} };
}

function deletePrevious(previous: MediaRecord | undefined): TransactItem[] {
  return previous ? [{ Delete: { TableName: tableName(), Key: mediaKey(previous.id) } }] : [];
}

export const dynamoMediaRepository: MediaRepository = {
  async get(id) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: mediaKey(id), ConsistentRead: true }),
    );
    return Item ? stripKeys<MediaRecord>(Item) : undefined;
  },

  async createPending(media) {
    const ttl = media.expiresAt ? { ttl: ttlFrom(new Date(media.expiresAt)) } : {};
    await dynamo().send(
      new PutCommand({
        TableName: tableName(),
        Item: { ...dbItem(mediaKey(media.id), MEDIA_ENTITY, media), ...ttl },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  },

  async attach({ ready, url, target, previous }) {
    const names = targetFields(target.field);
    const condition = areaCondition(previous?.id);
    const result = await transactWrite([
      {
        // Put sem `ttl` nem `expiresAt`: a pronta não vence (MID-06)
        Put: {
          TableName: tableName(),
          Item: dbItem(mediaKey(ready.id), MEDIA_ENTITY, ready),
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':pending': 'pending' },
        },
      },
      {
        Update: {
          TableName: tableName(),
          Key: target.key,
          UpdateExpression: 'SET #id = :id, #url = :url',
          ConditionExpression: condition.ConditionExpression,
          ExpressionAttributeNames: { '#id': names.id, '#url': names.url },
          ExpressionAttributeValues: { ':id': ready.id, ':url': url, ...condition.values },
        },
      },
      ...deletePrevious(previous),
    ]);
    return result.ok ? 'attached' : 'conflict';
  },

  async detach({ target, previous }) {
    const names = targetFields(target.field);
    const result = await transactWrite([
      {
        Update: {
          TableName: tableName(),
          Key: target.key,
          UpdateExpression: 'REMOVE #id, #url',
          ConditionExpression: 'attribute_exists(PK) AND #id = :expected',
          ExpressionAttributeNames: { '#id': names.id, '#url': names.url },
          ExpressionAttributeValues: { ':expected': previous.id },
        },
      },
      ...deletePrevious(previous),
    ]);
    return result.ok ? 'detached' : 'conflict';
  },
};
