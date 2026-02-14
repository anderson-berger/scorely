import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { User } from "@/modules/user/user_types";
import { env } from "@/utils/config/env";
import { $user } from "@/modules/user/user_schemas";
import {
  decodeCursor,
  encodeCursor,
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

const TABLE = env.TABLE;

export class UserRepository {
  async create(user: User): Promise<User> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `user_${user.id}`,
          SK: "user",
          GSI1PK: "users",
          GSI1SK: `user_${user.createdAt}`,
          data: user,
        },
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );
    return user;
  }

  async getById(userId: User["id"]): Promise<User | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          PK: `user_${userId}`,
          SK: "user",
        },
      }),
    );

    if (!result.Item) {
      return null;
    }

    const user = $user.parse(result.Item.data);
    return user;
  }

  async update(user: User): Promise<User> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `user_${user.id}`,
          SK: "user",
          GSI1PK: "users",
          GSI1SK: `user_${user.createdAt}_${user.id}`,
          data: user,
        },
        ConditionExpression: "data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":expectedVersion": user.version - 1,
        },
      }),
    );

    return user;
  }

  async list(query: PaginationQuery): Promise<PaginatedResult<User>> {
    const limit = query.limit ?? 20; // <- fallback defensivo

    const exclusiveStartKey = query.cursor
      ? decodeCursor(query.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "users",
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (result.Items ?? []).map((item) => $user.parse(item.data));

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }
}
