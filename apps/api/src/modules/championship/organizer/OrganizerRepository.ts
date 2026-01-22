import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import type { Organizer } from "./organizer_schemas";

export class OrganizerRepository {
  private tableName = env.TABLE;

  async create(organizer: Organizer): Promise<Organizer> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `CHAMPIONSHIP#${organizer.championshipId}`,
          SK: `ORGANIZER#${organizer.userId}`,
          GSI1PK: `USER#${organizer.userId}`,
          GSI1SK: `CHAMPIONSHIP#${organizer.championshipId}`,
          data: organizer,
        },
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return organizer;
  }
}
