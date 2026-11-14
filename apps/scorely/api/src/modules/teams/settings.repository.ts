import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { replaceItem, stripKeys } from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import type { TeamApartRule } from '@scorely/api/src/modules/teams/engine/rules';
import { TEAM_SETTINGS_ENTITY, teamSettingsKey } from '@scorely/api/src/modules/teams/settings.table';
import type { TeamRule } from '@scorely/contracts';

/** A configuração de times como fica no banco (a resposta é o `TeamSettings` de @scorely/contracts, com os nomes). */
export interface StoredTeamSettings {
  groupId: string;
  teamCount: number;
  rules: TeamRule[];
  /** Times opostos (TIM-22). Item antigo sem o campo = nenhum. */
  apart?: TeamApartRule[];
  /** "Espalhar homens e mulheres" (TIM-23). Item antigo sem o campo = desligada. */
  spreadGender?: boolean;
  allowOutsideRules: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamSettingsRepository {
  get(groupId: string): Promise<StoredTeamSettings | undefined>;
  /** Grava o item inteiro (o service mantém o `createdAt`); a `version` segue (ADR 0013). */
  put(settings: StoredTeamSettings): Promise<void>;
}

export const dynamoTeamSettingsRepository: TeamSettingsRepository = {
  async get(groupId) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: teamSettingsKey(groupId) }),
    );
    return Item ? stripKeys<StoredTeamSettings>(Item) : undefined;
  },

  async put(settings) {
    await dynamo().send(
      new UpdateCommand({
        TableName: tableName(),
        ...replaceItem(teamSettingsKey(settings.groupId), TEAM_SETTINGS_ENTITY, { ...settings }, [
          'apart',
          'spreadGender',
        ]),
      }),
    );
  },
};
