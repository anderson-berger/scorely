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
import type { User } from "@scorely/shared/schemas/user/user_schemas";

export class UserRepository {
  private tableName = env.TABLE;

  async create(user: User): Promise<User> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${user.id}`,
          SK: "METADATA",
          GSI1PK: `EMAIL#${user.email.toLowerCase()}`,
          GSI1SK: "USER",
          GSI2PK: "USERS",
          GSI2SK: `USER#${user.createdAt}#${user.id}`,
          data: user,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return user;
  }

  async update(user: User): Promise<User> {
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${user.id}`,
          SK: "METADATA",
        },
        UpdateExpression: `
        SET
          #data = :data
      `,
        ConditionExpression: `
        attribute_exists(PK)
        AND #data.#version = :expectedVersion
      `,
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":data": user,
          ":expectedVersion": user.version - 1,
        },
      }),
    );

    return user;
  }

  async findById(id: string): Promise<User | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${id}`,
          SK: "METADATA",
        },
      }),
    );

    if (!result.Item) return null;

    return result.Item.data as User;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
        ExpressionAttributeValues: {
          ":pk": `EMAIL#${email.toLowerCase()}`,
          ":sk": "USER",
        },
        Limit: 1,
      }),
    );

    if (!result.Items || result.Items.length === 0) return null;

    return result.Items[0].data as User;
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<User>> {
    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "USERS",
        },
        Limit: pagination.limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      }),
    );

    const items: User[] = (result.Items || []).map((item) => item.data as User);

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }
}
