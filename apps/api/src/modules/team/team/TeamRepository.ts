import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import { encodeCursor, decodeCursor } from "@/utils/pagination/pagination";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

import type { Team } from "@scorely/shared/schemas/team/team_schemas";

export class TeamRepository {
  private tableName = env.TABLE;

  async create(team: Team): Promise<Team> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `TEAM#${team.id}`,
          SK: "METADATA",
          GSI1PK: "TEAMS",
          GSI1SK: `TEAM#${team.createdAt}#${team.id}`,
          data: team,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return team;
  }

  async update(team: Team): Promise<Team> {
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `TEAM#${team.id}`,
          SK: "METADATA",
        },
        UpdateExpression: "SET #data = :data",
        ConditionExpression:
          "attribute_exists(PK) AND #data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":data": team,
          ":expectedVersion": team.version - 1,
        },
      }),
    );

    return team;
  }

  async findById(id: string): Promise<Team | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `TEAM#${id}`,
          SK: "METADATA",
        },
      }),
    );

    if (!result.Item) return null;

    return result.Item.data as Team;
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<Team>> {
    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "TEAMS",
        },
        Limit: pagination.limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      }),
    );

    const items: Team[] = (result.Items || []).map((item) => item.data as Team);

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }
}
