import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import { generateId, generateTimestamp } from "@/utils/generators";
import {
  encodeCursor,
  decodeCursor,
  type PaginatedResult,
  type PaginationQuery,
} from "@/utils/pagination/pagination";
import type { User, NewUser } from "@/modules/user/user.schemas";

export class UserRepository {
  private tableName = env.TABLE;

  // ============ PK/SK Helpers ============

  private getPK(id: string): string {
    return `USER#${id}`;
  }

  private getSK(): string {
    return "METADATA";
  }

  private getGSISK(user: User): string {
    return `USER#${user.createdAt}#${user.id}`;
  }

  // ============ Read ============

  async findById(id: string): Promise<User | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(id),
          SK: this.getSK(),
        },
      }),
    );

    return (result.Item?.data as User) || null;
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<User>> {
    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
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

  // ============ Create ============

  async create(input: NewUser): Promise<User> {
    const now = generateTimestamp();
    const user: User = {
      id: generateId(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...input,
    };

    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: this.getPK(user.id),
          SK: this.getSK(),
          GSI1PK: "USERS",
          GSI1SK: this.getGSISK(user),
          data: user,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return user;
  }

  // ============ Update ============

  async update(currentUser: User, attributes: Partial<User>): Promise<User> {
    const now = generateTimestamp();
    const updatedUser: User = {
      ...currentUser,
      ...attributes,
      version: currentUser.version + 1,
      updatedAt: now,
    };

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(updatedUser.id),
          SK: this.getSK(),
        },
        UpdateExpression: "SET #data = :data, GSI1SK = :gsi1sk",
        ConditionExpression:
          "attribute_exists(PK) AND #data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":data": updatedUser,
          ":gsi1sk": this.getGSISK(updatedUser),
          ":expectedVersion": currentUser.version,
        },
      }),
    );

    return updatedUser;
  }

  // ============ Delete ============

  async delete(id: string): Promise<void> {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(id),
          SK: this.getSK(),
        },
      }),
    );
  }
}
