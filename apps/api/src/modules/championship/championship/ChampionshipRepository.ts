import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import {
  encodeCursor,
  decodeCursor,
  type PaginatedResult,
  type PaginationQuery,
} from "@/utils/pagination/pagination";
import type { Championship } from "@scorely/shared/schemas/championship/championship_schemas";

export class ChampionshipRepository {
  private tableName = env.TABLE;

  async create(championship: Championship): Promise<Championship> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `CHAMPIONSHIP#${championship.id}`,
          SK: "METADATA",
          GSI1PK: "CHAMPIONSHIPS",
          GSI1SK: `CHAMPIONSHIP#${championship.createdAt}#${championship.id}`,
          data: championship,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return championship;
  }

  async update(championship: Championship): Promise<Championship> {
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `CHAMPIONSHIP#${championship.id}`,
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
          ":data": championship,
          ":expectedVersion": championship.version - 1,
        },
      }),
    );

    return championship;
  }

  async findById(id: string): Promise<Championship | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `CHAMPIONSHIP#${id}`,
          SK: "METADATA",
        },
      }),
    );

    if (!result.Item) return null;

    return result.Item.data as Championship;
  }

  async list(
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<Championship>> {
    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "CHAMPIONSHIPS",
        },
        Limit: pagination.limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      }),
    );

    const items: Championship[] = (result.Items || []).map(
      (item) => item.data as Championship,
    );

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }
}
