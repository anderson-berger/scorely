import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  isConditionFailed,
  LOOKUP_ENTITY,
  queryLookupRows,
  stripKeys,
  touch,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { UserId } from '@scorely/api/src/lib/ids';
import {
  GAME_ENTITY,
  gameKey,
  gamePk,
  groupGameLookupKey,
  groupGamesLookupPk,
  PLAYER_ENTITY,
  PLAYER_SK_PREFIX,
  playerKey,
} from '@scorely/api/src/modules/groups/game.table';
import { groupKey } from '@scorely/api/src/modules/groups/group.table';

/**
 * Jogo que virou item (GRP-10): só existe depois da 1ª escrita. O `id` é `<scheduleId>_<data>`. Guarda o início, o
 * fim e o lugar de quando virou item; as vagas e o mínimo só quando são do jogo (GRP-45, 46).
 */
export interface GameRecord {
  id: string;
  groupId: string;
  scheduleId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  placeId?: string;
  cancelledAt?: string;
  /** Vagas só deste jogo (GRP-45). Ausente = as do horário ou do grupo (GRP-66). */
  slots?: number;
  /** Mínimo só deste jogo (GRP-46). Ausente = o do horário ou do grupo. */
  minPlayers?: number;
  /** Quando o jogo chegou ao mínimo pela 1ª vez (GRP-47): o aviso sai uma vez só. */
  minReachedAt?: string;
  createdAt: string;
  updatedAt?: string;
  version?: number;
}

/** Vagas e mínimo só do jogo: número grava, `null` remove (volta ao padrão), ausente não muda. */
export interface GameSettingsPatch {
  slots?: number | null;
  minPlayers?: number | null;
}

/** Quem confirmou no jogo (GRP-18–20), na partição do jogo. */
export interface PlayerRecord {
  gameId: string;
  userId: UserId;
  confirmedAt: string;
}

export interface ReadOptions {
  consistent?: boolean;
}

export type AddAttendanceResult = 'added' | 'exists' | 'cancelled' | 'archived';

/** GRP-44: `not_cancelled` = o jogo já não estava cancelado; `archived` = o grupo foi arquivado (ganha se os dois falharem). */
export type ReopenResult = 'reopened' | 'not_cancelled' | 'archived';

export interface GameRepository {
  get(gameId: string, opts?: ReadOptions): Promise<GameRecord | undefined>;
  /** GRP-10: o jogo e o lookup dos jogos do grupo numa transação. `false` = outro request criou o jogo antes. */
  create(game: GameRecord): Promise<boolean>;
  /** Marca como cancelado (a primeira data de cancelamento fica). */
  cancel(gameId: string, cancelledAt: string): Promise<void>;
  /** Tira o `cancelledAt` numa transação que também confere o grupo não arquivado (GRP-44). Nada é gravado em falha. */
  reopen(gameId: string, groupId: string): Promise<ReopenResult>;
  /** GRP-45, 46: grava ou remove as vagas e o mínimo do jogo; devolve o item novo. */
  updateSettings(gameId: string, patch: GameSettingsPatch): Promise<GameRecord>;
  /** GRP-47: grava `minReachedAt` só se ainda não existe. `true` = esta chamada gravou (é quem avisa). */
  markMinReached(gameId: string, at: string): Promise<boolean>;
  /** A lista inteira, na ordem de chegada: `confirmedAt` e, no empate, `userId` (GRP-18, 19). */
  listPlayers(gameId: string, opts?: ReadOptions): Promise<PlayerRecord[]>;
  getPlayer(gameId: string, userId: UserId): Promise<PlayerRecord | undefined>;
  /**
   * O `PLAYER#` numa transação que também confere o jogo e o grupo (GRP-24, GRP-32).
   * `exists` = a pessoa já estava; `cancelled` = o jogo foi cancelado; `archived` = o grupo foi arquivado (ganha
   * de `cancelled` se os dois falharem). Em qualquer falha nada é gravado.
   */
  addPlayer(p: PlayerRecord, groupId: string): Promise<AddAttendanceResult>;
  /** Apaga o `PLAYER#`. Já apagado → nada a fazer. */
  removePlayer(p: PlayerRecord): Promise<void>;
  /**
   * Os jogos do grupo que viraram item, em ordem de início (o lookup, CMP-11, 16). Com `startsFrom`, só os que
   * começam nesse instante ou depois (os próximos jogos leem só a janela de agora, GRP-11).
   */
  listByGroup(groupId: string, opts?: { startsFrom?: string }): Promise<GameRecord[]>;
}

/** O Delete do jogador, para a transação de remover membro (GRP-25). */
export function playerDeletes(p: PlayerRecord) {
  return [{ Delete: { TableName: tableName(), Key: playerKey(p.gameId, p.userId) } }];
}

/** Os ids dos jogos do grupo que começam em `from` ou depois (o `SK` do lookup começa pelo `startsAt`). */
async function queryGameIdsFrom(
  groupId: string,
  from: string,
  startKey?: Record<string, unknown>,
): Promise<string[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND SK >= :from',
      ExpressionAttributeValues: { ':pk': groupGamesLookupPk(groupId), ':from': from },
      ProjectionExpression: 'id',
      ConsistentRead: true,
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  const ids = Items.map((row) => row.id as string);
  return LastEvaluatedKey ? [...ids, ...(await queryGameIdsFrom(groupId, from, LastEvaluatedKey))] : ids;
}

async function queryPlayers(
  gameId: string,
  consistent: boolean | undefined,
  startKey?: Record<string, unknown>,
): Promise<PlayerRecord[]> {
  const { Items = [], LastEvaluatedKey } = await dynamo().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': gamePk(gameId), ':prefix': PLAYER_SK_PREFIX },
      ConsistentRead: consistent,
      ...(startKey && { ExclusiveStartKey: startKey }),
    }),
  );
  const page = Items.map((row) => stripKeys<PlayerRecord>(row));
  return LastEvaluatedKey ? [...page, ...(await queryPlayers(gameId, consistent, LastEvaluatedKey))] : page;
}

async function getItem<T>(key: { PK: string; SK: string }, consistent = false): Promise<T | undefined> {
  const { Item } = await dynamo().send(
    new GetCommand({ TableName: tableName(), Key: key, ConsistentRead: consistent }),
  );
  return Item ? stripKeys<T>(Item) : undefined;
}

export const dynamoGameRepository: GameRepository = {
  async get(gameId, opts) {
    return getItem<GameRecord>(gameKey(gameId), opts?.consistent);
  },

  async create(game) {
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(gameKey(game.id), GAME_ENTITY, game),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupGameLookupKey(game.groupId, game.startsAt, game.id),
            LOOKUP_ENTITY,
            { id: game.id },
            game.createdAt,
          ),
        },
      },
    ]);
    return result.ok;
  },

  async cancel(gameId, cancelledAt) {
    await dynamo().send(
      new UpdateCommand(
        touch({
          TableName: tableName(),
          Key: gameKey(gameId),
          UpdateExpression: 'SET cancelledAt = if_not_exists(cancelledAt, :at)',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: { ':at': cancelledAt },
        }),
      ),
    );
  },

  async updateSettings(gameId, patch) {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    const set = entries.filter(([, v]) => v !== null);
    const remove = entries.filter(([, v]) => v === null);
    const clauses = [
      ...(set.length > 0 ? [`SET ${set.map(([k]) => `#${k} = :${k}`).join(', ')}`] : []),
      ...(remove.length > 0 ? [`REMOVE ${remove.map(([k]) => `#${k}`).join(', ')}`] : []),
    ];
    const { Attributes } = await dynamo().send(
      new UpdateCommand(
        touch({
          TableName: tableName(),
          Key: gameKey(gameId),
          UpdateExpression: clauses.join(' '),
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeNames: Object.fromEntries(entries.map(([k]) => [`#${k}`, k])),
          ...(set.length > 0 && {
            ExpressionAttributeValues: Object.fromEntries(set.map(([k, v]) => [`:${k}`, v])),
          }),
          ReturnValues: 'ALL_NEW',
        }),
      ),
    );
    return stripKeys<GameRecord>(Attributes ?? {});
  },

  async markMinReached(gameId, at) {
    try {
      await dynamo().send(
        new UpdateCommand(
          touch({
            TableName: tableName(),
            Key: gameKey(gameId),
            UpdateExpression: 'SET minReachedAt = :at',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(minReachedAt)',
            ExpressionAttributeValues: { ':at': at },
          }),
        ),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async reopen(gameId, groupId) {
    // Índices: 0 jogo cancelado, 1 grupo não arquivado. O ConditionCheck na mesma transação faz um
    // arquivamento simultâneo vir antes (reabertura falha) ou depois (o arquivamento cancela de novo).
    const result = await transactWrite([
      {
        Update: touch({
          TableName: tableName(),
          Key: gameKey(gameId),
          UpdateExpression: 'REMOVE cancelledAt',
          ConditionExpression: 'attribute_exists(cancelledAt)',
        }),
      },
      {
        ConditionCheck: {
          TableName: tableName(),
          Key: groupKey(groupId),
          ConditionExpression: 'attribute_not_exists(archivedAt)',
        },
      },
    ]);
    if (result.ok) return 'reopened';
    return result.failed.includes(1) ? 'archived' : 'not_cancelled';
  },

  async listPlayers(gameId, opts) {
    const players = await queryPlayers(gameId, opts?.consistent);
    return players.sort(
      (x, y) => x.confirmedAt.localeCompare(y.confirmedAt) || x.userId.localeCompare(y.userId),
    );
  },

  async getPlayer(gameId, userId) {
    return getItem<PlayerRecord>(playerKey(gameId, userId), true);
  },

  async addPlayer(p, groupId) {
    // Índices: 0 o jogador, 1 jogo não cancelado, 2 grupo não arquivado. Os ConditionCheck ficam na mesma transação:
    // um cancelamento ou arquivamento simultâneo sempre vem antes ou depois da confirmação (GRP-24, GRP-32).
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(playerKey(p.gameId, p.userId), PLAYER_ENTITY, p, p.confirmedAt),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        ConditionCheck: {
          TableName: tableName(),
          Key: gameKey(p.gameId),
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(cancelledAt)',
        },
      },
      {
        ConditionCheck: {
          TableName: tableName(),
          Key: groupKey(groupId),
          ConditionExpression: 'attribute_not_exists(archivedAt)',
        },
      },
    ]);
    if (result.ok) return 'added';
    if (result.failed.includes(2)) return 'archived';
    if (result.failed.includes(1)) return 'cancelled';
    return 'exists';
  },

  async removePlayer(p) {
    // Já apagado (outra desistência ou remoção): o resultado é o mesmo.
    await transactWrite(playerDeletes(p));
  },

  async listByGroup(groupId, opts) {
    const ids = opts?.startsFrom
      ? await queryGameIdsFrom(groupId, opts.startsFrom)
      : (await queryLookupRows(groupGamesLookupPk(groupId))).map((r) => r.id);
    const items = await batchGetOrdered(
      ids.map((id) => gameKey(id)),
      { consistent: true },
    );
    return items.map((row) => stripKeys<GameRecord>(row));
  },
};
