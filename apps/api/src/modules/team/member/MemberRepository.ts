import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import type { Member } from "@scorely/shared/schemas/team/member_schemas";

export class MemberRepository {
  private tableName = env.TABLE;

  async create(member: Member): Promise<Member> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `TEAM#${member.teamId}`,
          SK: `MEMBER#${member.userId}`,
          GSI1PK: `USER#${member.userId}`,
          GSI1SK: `TEAM#${member.teamId}`,
          data: member,
        },
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return member;
  }

  async update(member: Member): Promise<Member> {
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `TEAM#${member.teamId}`,
          SK: `MEMBER#${member.userId}`,
        },
        UpdateExpression: "SET #data = :data",
        ConditionExpression:
          "attribute_exists(PK) AND #data.#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#data": "data",
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":data": member,
          ":expectedVersion": member.version - 1,
        },
      }),
    );

    return member;
  }

  async delete(teamId: string, userId: string): Promise<void> {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `TEAM#${teamId}`,
          SK: `MEMBER#${userId}`,
        },
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  }

  async findByTeamAndUser(
    teamId: string,
    userId: string,
  ): Promise<Member | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `TEAM#${teamId}`,
          SK: `MEMBER#${userId}`,
        },
      }),
    );

    if (!result.Item) return null;

    return result.Item.data as Member;
  }

  async findByTeamId(teamId: string): Promise<Member[]> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `TEAM#${teamId}`,
          ":sk": "MEMBER#",
        },
      }),
    );

    return (result.Items || []).map((item) => item.data as Member);
  }

  async findByUserId(userId: string): Promise<Member[]> {
    const result = await dynamoDBClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
        },
      }),
    );

    return (result.Items || []).map((item) => item.data as Member);
  }
}
