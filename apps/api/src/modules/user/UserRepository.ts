import {
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { BaseRepository } from "@/infra/db/BaseRepository";
import type { RepositoryConfig } from "@/infra/db/base.schemas";
import { ConflictError } from "@/utils/error/errors";
import type { User, LookupType } from "@/modules/user/user.schemas";

export class UserRepository extends BaseRepository<User> {
  protected config: RepositoryConfig = {
    entityName: "USER",
    sk: "METADATA",
    gsiPK: "USERS",
  };

  private readonly LOOKUP_FIELDS: LookupType[] = ["email", "nickname"];

  // ============ Lookup Helpers ============

  private getLookupPK(type: LookupType, value: string): string {
    return `LOOKUP#${type.toUpperCase()}#${value.toLowerCase()}`;
  }

  private getLookupSK(): string {
    return "USER";
  }

  // ============ Lookup Methods ============

  async checkLookupExists(
    type: LookupType,
    value: string,
  ): Promise<string | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getLookupPK(type, value),
          SK: this.getLookupSK(),
        },
      }),
    );

    return result.Item ? (result.Item.userId as string) : null;
  }

  async findByLookup(type: LookupType, value: string): Promise<User | null> {
    const userId = await this.checkLookupExists(type, value);
    if (!userId) return null;
    return this.findById(userId);
  }

  async validateLookups(
    lookups: Partial<Pick<User, LookupType>>,
    excludeUserId?: string,
  ): Promise<void> {
    for (const field of this.LOOKUP_FIELDS) {
      const value = lookups[field];

      if (value !== undefined && value !== null) {
        const existingId = await this.checkLookupExists(field, value);

        if (existingId && existingId !== excludeUserId) {
          throw new ConflictError(`${field} '${value}' already exists`);
        }
      }
    }
  }

  // ============ CRUD with Lookups ============

  async createWithLookups(user: User): Promise<User> {
    const items: any[] = [];

    // 1. Item principal
    const mainItem: Record<string, any> = {
      PK: this.getPK(user.id),
      SK: this.getSK(),
      data: user,
    };

    if (this.getGSIPK()) {
      mainItem.GSI1PK = this.getGSIPK();
      mainItem.GSI1SK = this.getGSISK(user);
    }

    items.push({
      Put: {
        TableName: this.tableName,
        Item: mainItem,
        ConditionExpression: "attribute_not_exists(PK)",
      },
    });

    // 2. Criar lookups dinamicamente
    for (const field of this.LOOKUP_FIELDS) {
      const value = user[field];

      if (value !== undefined && value !== null) {
        items.push({
          Put: {
            TableName: this.tableName,
            Item: {
              PK: this.getLookupPK(field, value),
              SK: this.getLookupSK(),
              userId: user.id,
            },
            ConditionExpression: "attribute_not_exists(PK)",
          },
        });
      }
    }

    await dynamoDBClient.send(
      new TransactWriteCommand({
        TransactItems: items,
      }),
    );

    return user;
  }

  async updateWithLookups(user: User, oldUser: User): Promise<User> {
    const items: any[] = [];

    // 1. Update do item principal
    const updateExpression = this.getGSIPK()
      ? "SET #data = :data, GSI1SK = :gsi1sk"
      : "SET #data = :data";

    const expressionValues: Record<string, any> = {
      ":data": user,
      ":expectedVersion": user.version - 1,
    };

    if (this.getGSIPK()) {
      expressionValues[":gsi1sk"] = this.getGSISK(user);
    }

    items.push({
      Update: {
        TableName: this.tableName,
        Key: {
          PK: this.getPK(user.id),
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
      },
    });

    // 2. Atualizar lookups que mudaram
    for (const field of this.LOOKUP_FIELDS) {
      const oldValue = oldUser[field];
      const newValue = user[field];

      if (oldValue !== newValue) {
        // Deletar lookup antigo
        if (oldValue) {
          items.push({
            Delete: {
              TableName: this.tableName,
              Key: {
                PK: this.getLookupPK(field, oldValue),
                SK: this.getLookupSK(),
              },
            },
          });
        }

        // Criar lookup novo
        if (newValue) {
          items.push({
            Put: {
              TableName: this.tableName,
              Item: {
                PK: this.getLookupPK(field, newValue),
                SK: this.getLookupSK(),
                userId: user.id,
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          });
        }
      }
    }

    await dynamoDBClient.send(
      new TransactWriteCommand({
        TransactItems: items,
      }),
    );

    return user;
  }

  async deleteWithLookups(user: User): Promise<void> {
    const items: any[] = [];

    // 1. Deletar item principal
    items.push({
      Delete: {
        TableName: this.tableName,
        Key: {
          PK: this.getPK(user.id),
          SK: this.getSK(),
        },
      },
    });

    // 2. Deletar todos os lookups
    for (const field of this.LOOKUP_FIELDS) {
      const value = user[field];

      if (value !== undefined && value !== null) {
        items.push({
          Delete: {
            TableName: this.tableName,
            Key: {
              PK: this.getLookupPK(field, value),
              SK: this.getLookupSK(),
            },
          },
        });
      }
    }

    await dynamoDBClient.send(
      new TransactWriteCommand({
        TransactItems: items,
      }),
    );
  }
}
