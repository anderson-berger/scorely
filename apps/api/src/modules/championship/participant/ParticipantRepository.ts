import {
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import type { Participant } from "@scorely/shared/schemas/championship";

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
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return participant;
  }

  async delete(championshipId: string, teamId: string): Promise<void> {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `CHAMPIONSHIP#${championshipId}`,
          SK: `PARTICIPANT#${teamId}`,
        },
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  }

  async findByChampionshipAndTeam(
    championshipId: string,
    teamId: string,
  ): Promise<Participant | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `CHAMPIONSHIP#${championshipId}`,
          SK: `PARTICIPANT#${teamId}`,
        },
      }),
    );

    if (!result.Item) return null;

    return result.Item.data as Participant;
  }

  async findByChampionshipId(championshipId: string): Promise<Participant[]> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CHAMPIONSHIP#${championshipId}`,
          ":sk": "PARTICIPANT#",
        },
      }),
    );

    return (result.Items || []).map((item) => item.data as Participant);
  }

  async findByTeamId(teamId: string): Promise<Participant[]> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `TEAM#${teamId}`,
        },
      }),
    );

    return (result.Items || []).map((item) => item.data as Participant);
  }
}
