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
import type { Member, NewMember, MemberRole } from "@/modules/team/member/member.schemas";

export class MemberRepository {
  private tableName = env.TABLE;

  // ============ PK/SK Helpers ============

  private getPK(teamId: string): string {
    return `TEAM#${teamId}`;
  }

  private getSK(memberId: string): string {
    return `MEMBER#${memberId}`;
  }

  private getGSI1PK(userId: string): string {
    return `USER#${userId}`;
  }

  private getGSI1SK(member: Member): string {
    return `MEMBER#${member.createdAt}#${member.id}`;
  }

  // ============ Read ============

  async findById(teamId: string, memberId: string): Promise<Member | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(teamId),
          SK: this.getSK(memberId),
        },
      }),
    );

    return (result.Item?.data as Member) || null;
  }

  async findByTeamId(
    teamId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<Member>> {
    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": this.getPK(teamId),
          ":skPrefix": "MEMBER#",
        },
        Limit: pagination.limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      }),
    );

    const items: Member[] = (result.Items || []).map((item) => item.data as Member);

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  async findByUserId(
    userId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<Member>> {
    const exclusiveStartKey = pagination.cursor
      ? decodeCursor(pagination.cursor)
      : undefined;

    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": this.getGSI1PK(userId),
        },
        Limit: pagination.limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      }),
    );

    const items: Member[] = (result.Items || []).map((item) => item.data as Member);

    return {
      items,
      nextCursor: result.LastEvaluatedKey
        ? encodeCursor(result.LastEvaluatedKey)
        : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  async findByTeamAndUser(teamId: string, userId: string): Promise<Member | null> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        FilterExpression: "#data.#userId = :userId",
        ExpressionAttributeNames: {
          "#data": "data",
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":pk": this.getPK(teamId),
          ":skPrefix": "MEMBER#",
          ":userId": userId,
        },
        Limit: 1,
      }),
    );

    return (result.Items?.[0]?.data as Member) || null;
  }

  // ============ Create ============

  async create(input: NewMember): Promise<Member> {
    const now = generateTimestamp();
    const member: Member = {
      id: generateId(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      teamId: input.teamId,
      userId: input.userId,
      role: input.role,
      joinedAt: now,
    };

    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: this.getPK(member.teamId),
          SK: this.getSK(member.id),
          GSI1PK: this.getGSI1PK(member.userId),
          GSI1SK: this.getGSI1SK(member),
          data: member,
        },
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return member;
  }

  // ============ Update ============

  async update(currentMember: Member, attributes: Partial<Member>): Promise<Member> {
    const now = generateTimestamp();
    const updatedMember: Member = {
      ...currentMember,
      ...attributes,
      version: currentMember.version + 1,
      updatedAt: now,
    };

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(updatedMember.teamId),
          SK: this.getSK(updatedMember.id),
        },
        UpdateExpression: "SET #data = :data, GSI1SK = :gsi1sk",
        ConditionExpression:
          "attribute_exists(PK) AND #data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":data": updatedMember,
          ":gsi1sk": this.getGSI1SK(updatedMember),
          ":expectedVersion": currentMember.version,
        },
      }),
    );

    return updatedMember;
  }

  async updateRole(teamId: string, memberId: string, role: MemberRole): Promise<Member> {
    const currentMember = await this.findById(teamId, memberId);
    if (!currentMember) {
      throw new Error("Member not found");
    }

    return this.update(currentMember, { role });
  }

  // ============ Delete ============

  async delete(teamId: string, memberId: string): Promise<void> {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: this.getPK(teamId),
          SK: this.getSK(memberId),
        },
      }),
    );
  }

  async deleteAllByTeamId(teamId: string): Promise<void> {
    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      const result = await this.findByTeamId(teamId, { limit: 25, cursor });

      for (const member of result.items) {
        await this.delete(teamId, member.id);
      }

      hasMore = result.hasMore;
      cursor = result.nextCursor;
    }
  }
}
