import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  batchGetOrdered,
  dbItem,
  LOOKUP_ENTITY,
  queryLookupRows,
  stripKeys,
  transactWrite,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import {
  GAME_RESULT_ENTITY,
  gameResultKey,
  gameResultLookupKey,
  gameResultLookupPk,
} from '@scorely/api/src/modules/competition/result.table';
import type { AttendanceMark, CompetitionRules, GameResultWinner } from '@scorely/contracts';

/** O fechamento do jogo como fica no banco (CMP-11–15), com os ids do sistema (ou do avulso). */
export interface StoredGameResult {
  gameId: string;
  groupId: string;
  date: string;
  startsAt: string;
  cancelled: boolean;
  friendly: boolean;
  /** Cópia do regulamento do 1º fechamento (CMP-14). */
  rules: CompetitionRules;
  /** Os membros do grupo no 1º fechamento: só eles pontuam (CMP-14). */
  members: string[];
  /** A lista do jogo no 1º fechamento, na ordem: dentro ou fila pelas vagas daquele momento (CMP-14). Item sem o campo = a lista de agora. */
  list?: { id: string; inside: boolean }[];
  /** A temporada do jogo, se houver (CMP-29). */
  seasonId?: string;
  /** As reservas do grupo no 1º fechamento, para o papel da época na tela. Item sem o campo = nenhuma. */
  reserves?: string[];
  attendance: Record<string, AttendanceMark>;
  /** Os times publicados copiados (vazio sem times publicados). */
  teams: string[][];
  /** Os nomes dos avulsos dos times copiados (TIM-24). */
  extras?: { id: string; name: string }[];
  winner?: GameResultWinner | undefined;
  createdAt: string;
  updatedAt: string;
}

/** O que a correção troca (CMP-15): a cópia do regulamento e os membros ficam os do 1º fechamento. */
export interface GameResultPatch {
  attendance: Record<string, AttendanceMark>;
  teams: string[][];
  extras?: { id: string; name: string }[];
  /** Ausente ou `undefined` = sem resultado (o atributo sai). */
  winner?: GameResultWinner | undefined;
  friendly: boolean;
  updatedAt: string;
}

export interface ResultRepository {
  /** `consistent`: leitura fortemente consistente (reler logo depois de gravar). */
  get(gameId: string, opts?: { consistent?: boolean }): Promise<StoredGameResult | undefined>;
  /** Os fechamentos do grupo, pelo lookup (do mais antigo para o mais recente). */
  listByGroup(groupId: string): Promise<StoredGameResult[]>;
  /** 1º fechamento: a entidade e o lookup numa transação. `false` = já existia (outro aparelho fechou antes). */
  create(result: StoredGameResult): Promise<boolean>;
  /** Correção (CMP-15). Sem `winner` no patch = sem resultado (o atributo sai). */
  update(gameId: string, patch: GameResultPatch): Promise<void>;
}

export const dynamoResultRepository: ResultRepository = {
  async get(gameId, opts = {}) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: gameResultKey(gameId), ConsistentRead: opts.consistent }),
    );
    return Item ? stripKeys<StoredGameResult>(Item) : undefined;
  },

  async listByGroup(groupId) {
    const rows = await queryLookupRows(gameResultLookupPk(groupId));
    const items = await batchGetOrdered(rows.map((r) => gameResultKey(r.id)));
    return items.map((row) => stripKeys<StoredGameResult>(row));
  },

  async create(result) {
    const outcome = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(gameResultKey(result.gameId), GAME_RESULT_ENTITY, result, result.createdAt),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            gameResultLookupKey(result.groupId, result.startsAt, result.gameId),
            LOOKUP_ENTITY,
            { id: result.gameId },
            result.createdAt,
          ),
        },
      },
    ]);
    return outcome.ok;
  },

  async update(gameId, patch) {
    const sets = [
      'attendance = :attendance',
      'teams = :teams',
      'friendly = :friendly',
      'updatedAt = :updatedAt',
    ];
    const values: Record<string, unknown> = {
      ':attendance': patch.attendance,
      ':teams': patch.teams,
      ':friendly': patch.friendly,
      ':updatedAt': patch.updatedAt,
    };
    if (patch.extras) {
      sets.push('extras = :extras');
      values[':extras'] = patch.extras;
    }
    if (patch.winner !== undefined) {
      sets.push('winner = :winner');
      values[':winner'] = patch.winner;
    }
    await dynamo().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: gameResultKey(gameId),
        UpdateExpression: `SET ${sets.join(', ')}${patch.winner === undefined ? ' REMOVE winner' : ''}`,
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: values,
      }),
    );
  },
};
