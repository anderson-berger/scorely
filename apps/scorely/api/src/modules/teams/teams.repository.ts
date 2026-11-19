import { DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { replaceItem, sendVersioned, stripKeys, withVersion } from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { TeamApartRule } from '@scorely/api/src/modules/teams/engine/rules';
import { TEAMS_ENTITY, teamsKey } from '@scorely/api/src/modules/teams/teams.table';
import type { PlayerPosition, TeamExtra, TeamRule, TeamsStatus } from '@scorely/contracts';

/** Os times do jogo como ficam no banco (a resposta é o `Teams` de @scorely/contracts, montado pelo service). */
export interface StoredTeams {
  /** GRP-10: o jogo dos times (`<scheduleId>_<data>`). */
  gameId: string;
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
  /** TIM-25 (ADR 0013). */
  version: number;
}

/** Campos opcionais: ausentes no item novo, saem do gravado (o `Put` de antes fazia isso). */
const OPTIONAL = ['pinned', 'publishedAt', 'rules', 'apart', 'extras'] as const;

export interface TeamsRepository {
  get(gameId: string): Promise<StoredTeams | undefined>;
  /**
   * Grava o item inteiro (o service mantém `createdAt` e `publishedAt`); a `version` segue (ADR 0013). Só grava na
   * versão esperada (`0` = o jogo ainda sem times, TIM-25); senão, `VERSION_CONFLICT`.
   */
  put(teams: StoredTeams, expectedVersion: number): Promise<void>;
  /** Descarta os times (TIM-06), só na versão esperada (TIM-25). */
  delete(gameId: string, expectedVersion: number): Promise<void>;
}

/** O Delete dos times, antes da condição da versão. */
function deleteOf(key: { PK: string; SK: string }): {
  TableName: string;
  Key: { PK: string; SK: string };
  ConditionExpression?: string;
} {
  return { TableName: tableName(), Key: key };
}

export const dynamoTeamsRepository: TeamsRepository = {
  async get(gameId) {
    const { Item } = await dynamo().send(new GetCommand({ TableName: tableName(), Key: teamsKey(gameId) }));
    return Item ? stripKeys<StoredTeams>(Item) : undefined;
  },

  async put(teams, expectedVersion) {
    const key = teamsKey(teams.gameId);
    await sendVersioned(key, () =>
      dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          ...withVersion(replaceItem(key, TEAMS_ENTITY, { ...teams }, OPTIONAL), expectedVersion),
        }),
      ),
    );
  },

  async delete(gameId, expectedVersion) {
    const key = teamsKey(gameId);
    await sendVersioned(key, () =>
      dynamo().send(new DeleteCommand(withVersion(deleteOf(key), expectedVersion))),
    );
  },
};
