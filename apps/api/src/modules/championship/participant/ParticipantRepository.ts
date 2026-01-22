import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import type { Participant } from "./participant_schemas";

export class ParticipantRepository {
  private tableName = env.TABLE;

  async create(participant: Participant): Promise<Participant> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `CHAMPIONSHIP#${participant.championshipId}`,
          SK: `PARTICIPANT#${participant.teamId}`,
          GSI1PK: `TEAM#${participant.teamId}`,
          GSI1SK: `CHAMPIONSHIP#${participant.championshipId}`,
          data: participant,
        },
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return participant;
  }
}
