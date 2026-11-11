import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { PlayerPosition } from '@scorely/contracts';
import { batchGetOrdered, setCreatedAtIfNew, stripKeys } from '../../lib/db';
import { dynamo, tableName } from '../../lib/dynamo';
import { PLAYER_ENTITY, playerKey } from './player.table';

/** O jogador como fica no banco (a resposta é o `Player` de @scorely/contracts). */
export interface StoredPlayer {
  groupId: string;
  userId: string;
  /** A primeira é a principal (TIM-02); a ordem gravada é a devolvida. */
  positions: PlayerPosition[];
  createdAt: string;
  updatedAt: string;
}

export interface PlayerRepository {
  /** Os que existem, em qualquer ordem; quem nunca foi definido não vem. */
  getMany(groupId: string, userIds: string[]): Promise<StoredPlayer[]>;
  /** Upsert: grava as posições na ordem (substitui) e mantém o `createdAt` de quando nasceu. */
  save(groupId: string, userId: string, positions: PlayerPosition[], now: string): Promise<StoredPlayer>;
}

export const dynamoPlayerRepository: PlayerRepository = {
  async getMany(groupId, userIds) {
    const items = await batchGetOrdered(userIds.map((id) => playerKey(groupId, id)));
    return items.map((item) => stripKeys<StoredPlayer>(item));
  },

  async save(groupId, userId, positions, now) {
    const created = setCreatedAtIfNew(new Date(now));
    const { Attributes } = await dynamo().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: playerKey(groupId, userId),
        UpdateExpression: `SET entity = :entity, groupId = :groupId, userId = :userId, positions = :positions, updatedAt = :now, ${created.expression}`,
        ExpressionAttributeValues: {
          ':entity': PLAYER_ENTITY,
          ':groupId': groupId,
          ':userId': userId,
          ':positions': positions,
          ':now': now,
          ...created.values,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return stripKeys<StoredPlayer>(Attributes ?? {});
  },
};
