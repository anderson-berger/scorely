import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import type { Organizer } from "@scorely/shared/schemas/championship";

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
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return organizer;
  }

  async update(organizer: Organizer): Promise<Organizer> {
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `CHAMPIONSHIP#${organizer.championshipId}`,
          SK: `ORGANIZER#${organizer.userId}`,
        },
        UpdateExpression: "SET #data = :data",
        ConditionExpression:
          "attribute_exists(PK) AND #data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":data": organizer,
          ":expectedVersion": organizer.version - 1,
        },
      }),
    );

    return organizer;
  }

  async delete(championshipId: string, userId: string): Promise<void> {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `CHAMPIONSHIP#${championshipId}`,
          SK: `ORGANIZER#${userId}`,
        },
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  }

  async findByChampionshipAndUser(
    championshipId: string,
    userId: string,
  ): Promise<Organizer | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `CHAMPIONSHIP#${championshipId}`,
          SK: `ORGANIZER#${userId}`,
        },
      }),
    );

    if (!result.Item) return null;

    return result.Item.data as Organizer;
  }

  async findByChampionshipId(championshipId: string): Promise<Organizer[]> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CHAMPIONSHIP#${championshipId}`,
          ":sk": "ORGANIZER#",
        },
      }),
    );

    return (result.Items || []).map((item) => item.data as Organizer);
  }

  async findByUserId(userId: string): Promise<Organizer[]> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
        },
      }),
    );

    return (result.Items || []).map((item) => item.data as Organizer);
  }
}
