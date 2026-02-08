import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { BaseRepository } from "@/infra/db/BaseRepository";
import { env } from "@/utils/config/env";
import type { Team, NewTeam } from "@/modules/team/team/team.schemas";

export class TeamRepository extends BaseRepository<Team, NewTeam> {
  constructor() {
    super({
      tableName: env.TABLE,
      entityName: "team",
    });
  }

  async findByIds(ids: string[]): Promise<Team[]> {
    if (ids.length === 0) return [];

    const result = await dynamoDBClient.send(
      new BatchGetCommand({
        RequestItems: {
          [this.config.tableName]: {
            Keys: ids.map((id) => ({
              PK: this.getPK(id),
              SK: this.getSK(),
            })),
          },
        },
      }),
    );

    const items = result.Responses?.[this.config.tableName] || [];
    return items.map((item) => item.data as Team);
  }
}
