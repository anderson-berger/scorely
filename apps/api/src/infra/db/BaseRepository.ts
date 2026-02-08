import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { generateId, generateTimestamp } from "@/utils/generators";
import {
  encodeCursor,
  decodeCursor,
  type PaginatedResult,
  type PaginationQuery,
} from "@/utils/pagination/pagination";
import { ConflictError } from "@/utils/error/errors";

export interface BaseEntity {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryConfig<T> {
  tableName: string;
  entityName: string;
  lookupFields?: (keyof T)[];
}

export abstract class BaseRepository<
  TEntity extends BaseEntity,
  TNew extends Record<string, any>,
> {
  protected config: RepositoryConfig<TEntity>;

  constructor(config: RepositoryConfig<TEntity>) {
    this.config = config;
  }

  // ============ PK/SK Helpers ============

  protected getPK(id: string): string {
    return `${this.config.entityName.toUpperCase()}#${id}`;
  }

  protected getSK(): string {
    return this.config.entityName.toUpperCase();
  }

  protected getGSIPK(): string {
    return `${this.config.entityName.toUpperCase()}S`;
  }

  protected getGSISK(entity: TEntity): string {
    return `${this.config.entityName.toUpperCase()}#${entity.createdAt}#${entity.id}`;
  }

  protected getLookupPK(field: string, value: string): string {
    return `LOOKUP#${this.config.entityName.toUpperCase()}_${field.toUpperCase()}#${value.toLowerCase()}`;
  }

  protected getLookupSK(): string {
    return this.config.entityName.toUpperCase();
  }

  // ============ Create ============

  async create(input: TNew): Promise<TEntity> {
    const entity = this.buildEntity(input);

    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: {
          PK: this.getPK(entity.id),
          SK: this.getSK(),
          GSI1PK: this.getGSIPK(),
          GSI1SK: this.getGSISK(entity),
          data: entity,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    await this.syncLookups(undefined, entity);

    return entity;
  }

  // ============ Read ============

  async findById(id: string): Promise<TEntity | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: {
          PK: this.getPK(id),
          SK: this.getSK(),
        },
      }),
    );

    return result.Item ? (result.Item.data as TEntity) : null;
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<TEntity>> {
    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.config.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": this.getGSIPK(),
        },
        Limit: pagination.limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      }),
    );

    const items: TEntity[] = (result.Items || []).map(
      (item) => item.data as TEntity,
    );

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  // ============ Update ============

  async update(
    currentEntity: TEntity,
    changes: Partial<TNew>,
  ): Promise<TEntity> {
    const now = generateTimestamp();
    const updatedEntity: TEntity = {
      ...currentEntity,
      ...changes,
      version: currentEntity.version + 1,
      updatedAt: now,
    } as TEntity;

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.config.tableName,
        Key: {
          PK: this.getPK(updatedEntity.id),
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
          ":data": updatedEntity,
          ":gsi1sk": this.getGSISK(updatedEntity),
          ":expectedVersion": currentEntity.version,
        },
      }),
    );

    await this.syncLookups(currentEntity, updatedEntity);

    return updatedEntity;
  }

  // ============ Delete ============

  async delete(id: string): Promise<void> {
    const entity = await this.findById(id);

    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: this.config.tableName,
        Key: {
          PK: this.getPK(id),
          SK: this.getSK(),
        },
      }),
    );

    if (entity) {
      await this.syncLookups(entity, undefined);
    }
  }

  // ============ Lookup Methods ============

  async findByLookup(field: keyof TEntity, value: string): Promise<TEntity | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: {
          PK: this.getLookupPK(field as string, value),
          SK: this.getLookupSK(),
        },
      }),
    );

    if (!result.Item) return null;

    return this.findById(result.Item.entityId as string);
  }

  protected async syncLookups(
    oldEntity: TEntity | undefined,
    newEntity: TEntity | undefined,
  ): Promise<void> {
    if (!this.config.lookupFields) return;

    const operations: Promise<void>[] = [];

    for (const field of this.config.lookupFields) {
      const oldValue = oldEntity?.[field] as string | undefined;
      const newValue = newEntity?.[field] as string | undefined;

      if (oldValue === newValue) continue;

      if (oldValue) {
        operations.push(this.deleteLookup(field as string, oldValue));
      }

      if (newValue && newEntity) {
        operations.push(
          this.createLookup(field as string, newValue, newEntity.id),
        );
      }
    }

    await Promise.all(operations);
  }

  private async createLookup(
    field: string,
    value: string,
    entityId: string,
  ): Promise<void> {
    try {
      await dynamoDBClient.send(
        new PutCommand({
          TableName: this.config.tableName,
          Item: {
            PK: this.getLookupPK(field, value),
            SK: this.getLookupSK(),
            GSI1PK: `${this.config.entityName.toUpperCase()}_LOOKUPS#${entityId}`,
            GSI1SK: this.getLookupPK(field, value),
            entityId,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error: any) {
      if (error.name === "ConditionalCheckFailedException") {
        throw new ConflictError(`${field} '${value}' already exists`);
      }
      throw error;
    }
  }

  private async deleteLookup(field: string, value: string): Promise<void> {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: this.config.tableName,
        Key: {
          PK: this.getLookupPK(field, value),
          SK: this.getLookupSK(),
        },
      }),
    );
  }

  async deleteAllLookupsByEntityId(entityId: string): Promise<void> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.config.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `${this.config.entityName.toUpperCase()}_LOOKUPS#${entityId}`,
        },
      }),
    );

    if (!result.Items || result.Items.length === 0) return;

    await Promise.all(
      result.Items.map((item) =>
        dynamoDBClient.send(
          new DeleteCommand({
            TableName: this.config.tableName,
            Key: {
              PK: item.PK,
              SK: item.SK,
            },
          }),
        ),
      ),
    );
  }

  // ============ Entity Builder ============

  protected buildEntity(input: TNew): TEntity {
    const now = generateTimestamp();
    return {
      id: generateId(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...input,
    } as unknown as TEntity;
  }
}
