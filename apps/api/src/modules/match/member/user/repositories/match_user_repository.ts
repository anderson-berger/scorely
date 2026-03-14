import { dynamoDBClient } from "@/shared/db/dynamodb_client";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { MatchUser } from "@/modules/match/member/user/match_user_types";

import { env } from "@/utils/config/env";
import { User } from "@/modules/user/user_types";
import { Match } from "@/modules/match/match_types";
import {
  decodeCursor,
  encodeCursor,
  PaginatedResult,
  PaginationQuery,
} from "@/shared/pagination/pagination";
import { $matchUser } from "../match_user_schemas";
import { generateTimestamp } from "@/utils/generators";

const TABLE = env.TABLE;

export class MatchUserRepository {
  // ============ PK/SK Helpers ============

  private getPK(matchId: Match["id"]): string {
    return `MATCH_${matchId}`;
  }

  private getSK(matchUserId: MatchUser["id"]): string {
    return `MATCH_USER_${matchUserId}`;
  }

  private getGSI1PK(userId: User["id"]): string {
    return `USER_${userId}`;
  }

  private getGSI1SK(matchUser: MatchUser): string {
    return `MATCH_USER_${matchUser.createdAt}_${matchUser.id}`;
  }

  // ============ Create ============

  async create(matchUser: MatchUser): Promise<MatchUser> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: this.getPK(matchUser.matchId),
          SK: this.getSK(matchUser.id),
          ENTITY: "MATCH_USER",
          GSI1PK: this.getGSI1PK(matchUser.userId),
          GSI1SK: this.getGSI1SK(matchUser),
          data: matchUser,
        },
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );
    return matchUser;
  }

  // ============ Read ============

  async findById(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
  ): Promise<MatchUser | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          PK: this.getPK(matchId),
          SK: this.getSK(matchUserId),
        },
      }),
    );

    if (!result.Item) return null;
    const matchUser = $matchUser.parse(result.Item.data);
    if (matchUser.deletedAt) return null;
    return matchUser;
  }

  async findByMatchId(
    matchId: Match["id"],
    query: PaginationQuery,
  ): Promise<PaginatedResult<MatchUser>> {
    const limit = query.limit ?? 20;
    const exclusiveStartKey = query.cursor
      ? decodeCursor(query.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: "attribute_not_exists(#data.#deletedAt)",
        ExpressionAttributeNames: {
          "#data": "data",
          "#deletedAt": "deletedAt",
        },
        ExpressionAttributeValues: {
          ":pk": this.getPK(matchId),
          ":sk": "MATCH_USER_",
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (result.Items ?? []).map((item) =>
      $matchUser.parse(item.data),
    );

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  async findByMatchAndUser(
    matchId: Match["id"],
    userId: User["id"],
  ): Promise<MatchUser | null> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression:
          "#data.#userId = :userId AND attribute_not_exists(#data.#deletedAt)",
        ExpressionAttributeNames: {
          "#data": "data",
          "#userId": "userId",
          "#deletedAt": "deletedAt",
        },
        ExpressionAttributeValues: {
          ":pk": this.getPK(matchId),
          ":sk": "MATCH_USER_",
          ":userId": userId,
        },
        Limit: 1,
      }),
    );

    if (!result.Items?.[0]) return null;
    return $matchUser.parse(result.Items[0].data);
  }

  async matchUserListByUserId(
    userId: User["id"],
    query: PaginationQuery,
  ): Promise<PaginatedResult<MatchUser>> {
    const limit = query.limit ?? 20;
    const exclusiveStartKey = query.cursor
      ? decodeCursor(query.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        FilterExpression: "attribute_not_exists(#data.#deletedAt)",
        ExpressionAttributeNames: {
          "#data": "data",
          "#deletedAt": "deletedAt",
        },
        ExpressionAttributeValues: {
          ":pk": this.getGSI1PK(userId),
          ":sk": "MATCH_USER_",
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (result.Items ?? []).map((item) =>
      $matchUser.parse(item.data),
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

  async updateRole(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
    role: MatchUser["role"],
  ): Promise<MatchUser> {
    const current = await this.findById(matchId, matchUserId);
    if (!current) throw new Error("MatchUser not found");

    const now = generateTimestamp();
    const updated: MatchUser = {
      ...current,
      role,
      version: current.version + 1,
      updatedAt: now,
    };

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          PK: this.getPK(matchId),
          SK: this.getSK(matchUserId),
        },
        UpdateExpression: "SET #data = :data",
        ConditionExpression:
          "attribute_exists(PK) AND #data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":data": updated,
          ":expectedVersion": current.version,
        },
      }),
    );

    return updated;
  }

  // ============ Delete ============

  async delete(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
  ): Promise<void> {
    const now = generateTimestamp();
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          PK: this.getPK(matchId),
          SK: this.getSK(matchUserId),
        },
        UpdateExpression:
          "SET #data.#deletedAt = :deletedAt, #data.#updatedAt = :now, #data.#version = #data.#version + :inc",
        ExpressionAttributeNames: {
          "#data": "data",
          "#deletedAt": "deletedAt",
          "#updatedAt": "updatedAt",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":deletedAt": now,
          ":now": now,
          ":inc": 1,
        },
      }),
    );
  }

  async deleteAllByMatchId(matchId: Match["id"]): Promise<void> {
    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      const result = await this.findByMatchId(matchId, { limit: 25, cursor });

      for (const member of result.items) {
        await this.delete(matchId, member.id);
      }

      hasMore = result.hasMore;
      cursor = result.nextCursor;
    }
  }
}
