import { PutCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import {
  encodeCursor,
  decodeCursor,
  type PaginatedResult,
  type PaginationQuery,
} from "@/utils/pagination/pagination";
import type { Team } from "./team/team_schemas";

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
          ...team,
        },
        ConditionExpression: "attribute_not_exists(PK)",
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

    return {
      id: result.Item.id,
      name: result.Item.name,
      createdAt: result.Item.createdAt,
      updatedAt: result.Item.updatedAt,
    };
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

    const items: Team[] = (result.Items || []).map((item) => ({
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }
}
