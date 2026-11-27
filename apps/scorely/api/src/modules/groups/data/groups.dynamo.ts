// O acesso ao DynamoDB que mais de um assunto do grupo usa.
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { COUNTERS_ENTITY, type TransactItem } from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { GroupId } from '@scorely/api/src/lib/ids';
import { groupCountersKey } from '@scorely/api/src/modules/groups/data/groups.table';
import { GROUP_PARTICIPANT_MAX } from '@scorely/contracts';

export const joinedPk = (id: GroupId) => `GROUP#${id}`;

/**
 * GRV-54: soma `delta` nos participantes. Ao entrar (+1), com a condição de ter vaga: a falha dela é o grupo cheio.
 * O contador nasce com o grupo; o `if_not_exists` só protege o `createdAt`.
 */
export function participantsDelta(groupId: GroupId, delta: 1 | -1, at: string): TransactItem {
  return {
    Update: {
      TableName: tableName(),
      Key: groupCountersKey(groupId),
      UpdateExpression:
        'SET #entity = :entity, createdAt = if_not_exists(createdAt, :createdAt) ADD participants :delta',
      ...(delta === 1 && {
        ConditionExpression: 'attribute_not_exists(participants) OR participants < :max',
      }),
      ExpressionAttributeNames: { '#entity': 'entity' },
      ExpressionAttributeValues: {
        ':entity': COUNTERS_ENTITY,
        ':createdAt': at,
        ':delta': delta,
        ...(delta === 1 && { ':max': GROUP_PARTICIPANT_MAX }),
      },
    },
  };
}

/** Query de uma partição do grupo por prefixo de `SK`, seguindo as páginas. */
export async function queryByPrefix(
  id: GroupId,
  prefix: string,
  startKey?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': joinedPk(id), ':prefix': prefix },
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  return LastEvaluatedKey ? [...Items, ...(await queryByPrefix(id, prefix, LastEvaluatedKey))] : Items;
}

export async function getItem(
  Key: Record<string, string>,
  consistent = false,
): Promise<Record<string, unknown> | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key, ConsistentRead: consistent }),
  );
  return Item;
}
