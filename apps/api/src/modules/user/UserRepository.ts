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
import type { User, NewUser, UpdateUser } from "./user_schemas";

export class UserRepository {
  private tableName = env.TABLE;

  async create(data: NewUser): Promise<User> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const user: User = {
      id,
      email: data.email,
      name: data.name,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${id}`,
          SK: "METADATA",
          GSI1PK: `EMAIL#${data.email.toLowerCase()}`,
          GSI1SK: "USER",
          GSI2PK: "USERS",
          GSI2SK: `USER#${now}#${id}`,
          ...user,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return user;
  }

  async update(id: string, data: UpdateUser): Promise<User | null> {
    const now = new Date().toISOString();

    const result = await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${id}`,
          SK: "METADATA",
        },
        UpdateExpression: "SET #name = :name, #updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#name": "name",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":name": data.name,
          ":updatedAt": now,
        },
        ConditionExpression: "attribute_exists(PK)",
        ReturnValues: "ALL_NEW",
      }),
    );

    if (!result.Attributes) return null;

    return {
      id: result.Attributes.id,
      email: result.Attributes.email,
      name: result.Attributes.name,
      createdAt: result.Attributes.createdAt,
      updatedAt: result.Attributes.updatedAt,
    };
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

    return {
      id: result.Item.id,
      email: result.Item.email,
      name: result.Item.name,
      createdAt: result.Item.createdAt,
      updatedAt: result.Item.updatedAt,
    };
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

    const item = result.Items[0];
    return {
      id: item.id,
      email: item.email,
      name: item.name,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
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

    const items: User[] = (result.Items || []).map((item) => ({
      id: item.id,
      email: item.email,
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
