import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dbItem, stripKeys } from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { TeamApartRule } from '@scorely/api/src/modules/teams/engine/rules';
import { TEAMS_ENTITY, teamsKey } from '@scorely/api/src/modules/teams/teams.table';
import type { PlayerPosition, TeamExtra, TeamRule, TeamsStatus } from '@scorely/contracts';

/** Os times do jogo como ficam no banco (a resposta é o `Teams` de @scorely/contracts, montado pelo service). */
export interface StoredTeams {
  groupId: string;
  /** Data local do jogo (`Game.date`). */
  date: string;
  status: TeamsStatus;
  /** Ids por time, na ordem ("Time 1", "Time 2"...): o id do sistema da pessoa ou o do avulso (USR-17). */
  teams: string[][];
  /** Só os ajustes de posição deste jogo (TIM-13). */
  positions: Record<string, PlayerPosition[]>;
  /** Quem está fixo no time em que está (TIM-16). Item antigo sem o campo = ninguém. */
  pinned?: string[];
  /** A 1ª publicação (TIM-10). */
  publishedAt?: string;
  /** Cópia das regras do último sorteio (TIM-19). Salvar à mão mantém a cópia. */
  rules?: TeamRule[];
  /** Cópia dos times opostos do último sorteio (TIM-19, 22). */
  apart?: TeamApartRule[];
  /** Os avulsos do jogo (TIM-24). Item antigo sem o campo = nenhum. */
  extras?: TeamExtra[];
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
