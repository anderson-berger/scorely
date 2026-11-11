import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PlayerPosition, TeamsStatus } from '@scorely/contracts';
import { dbItem, stripKeys } from '../../lib/db';
import { dynamo, tableName } from '../../lib/dynamo';
import { TEAMS_ENTITY, teamsKey } from './teams.table';

/** Os times do jogo como ficam no banco (a resposta é o `Teams` de @scorely/contracts, montado pelo service). */
export interface StoredTeams {
  groupId: string;
  /** Data local do jogo (`Game.date`). */
  date: string;
  status: TeamsStatus;
  /** Ids por time, na ordem ("Time 1", "Time 2"...). */
  teams: string[][];
  /** Só os ajustes de posição deste jogo (TIM-13). */
  positions: Record<string, PlayerPosition[]>;
  /** A 1ª publicação (TIM-10). */
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamsRepository {
  get(groupId: string, date: string): Promise<StoredTeams | undefined>;
  /** Grava o item inteiro (o service mantém `createdAt` e `publishedAt`). */
  put(teams: StoredTeams): Promise<void>;
  delete(groupId: string, date: string): Promise<void>;
}

export const dynamoTeamsRepository: TeamsRepository = {
  async get(groupId, date) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: teamsKey(groupId, date) }),
    );
    return Item ? stripKeys<StoredTeams>(Item) : undefined;
  },

  async put(teams) {
    await dynamo().send(
      new PutCommand({
        TableName: tableName(),
        Item: dbItem(teamsKey(teams.groupId, teams.date), TEAMS_ENTITY, teams, teams.createdAt),
      }),
    );
  },

  async delete(groupId, date) {
    await dynamo().send(new DeleteCommand({ TableName: tableName(), Key: teamsKey(groupId, date) }));
  },
};
