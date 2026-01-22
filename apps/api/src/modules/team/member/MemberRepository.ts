import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { env } from "@/utils/config/env";
import type { Member } from "./member_schemas";

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
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );

    return member;
  }
}
