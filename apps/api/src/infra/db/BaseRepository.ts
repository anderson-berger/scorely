import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import {
  encodeCursor,
  decodeCursor,
  type PaginatedResult,
  type PaginationQuery,
} from "@/utils/pagination/pagination";
import type { BaseEntity, RepositoryConfig } from "./base.schemas";

export abstract class BaseRepository<T extends BaseEntity> {
  protected tableName = env.TABLE;
  protected abstract config: RepositoryConfig;

  // ============ PK/SK Helpers ============

  protected getPK(id: string): string {
    return `${this.config.entityName}#${id}`;
  }

  protected getSK(): string {
    return this.config.sk;
  }

  protected getGSIPK(): string | null {
    return this.config.gsiPK;
  }

  protected getGSISK(entity: T): string {
    return `${this.config.entityName}#${entity.createdAt}#${entity.id}`;
  }

  // ============ CRUD ============

  async findById(id: string): Promise<T | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(id),
          SK: this.getSK(),
        },
      }),
    );

    return (result.Item?.data as T) || null;
  }

  async create(entity: T): Promise<T> {
    const item: Record<string, any> = {
      PK: this.getPK(entity.id),
      SK: this.getSK(),
      data: entity,
    };

    // Só adiciona GSI se configurado
    if (this.getGSIPK()) {
      item.GSI1PK = this.getGSIPK();
      item.GSI1SK = this.getGSISK(entity);
    }

    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return entity;
  }

  async update(entity: T): Promise<T> {
    const updateExpression = this.getGSIPK()
      ? "SET #data = :data, GSI1SK = :gsi1sk"
      : "SET #data = :data";

    const expressionValues: Record<string, any> = {
      ":data": entity,
      ":expectedVersion": entity.version - 1,
    };

    if (this.getGSIPK()) {
      expressionValues[":gsi1sk"] = this.getGSISK(entity);
    }

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(entity.id),
          SK: this.getSK(),
        },
        UpdateExpression: updateExpression,
        ConditionExpression:
          "attribute_exists(PK) AND #data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: expressionValues,
      }),
    );

    return entity;
  }

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

  async list(pagination: PaginationQuery): Promise<PaginatedResult<T>> {
    const gsiPK = this.getGSIPK();

    if (!gsiPK) {
      return { items: [], hasMore: false };
    }

    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": gsiPK,
        },
        Limit: pagination.limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      }),
    );

    const items: T[] = (result.Items || []).map((item) => item.data as T);

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }
}
