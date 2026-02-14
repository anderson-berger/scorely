import { dynamoDBClient } from "@/utils/db/dynamodb_client";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { User } from "@/modules/user/user_types";
import { env } from "@/utils/config/env";

const TABLE = env.TABLE;

export class UserLookupsRepository {
  async createEmailLookup(
    userId: User["id"],
    email: NonNullable<User["email"]>,
  ): Promise<void> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `lookup_email_${email.toLowerCase()}`,
          SK: `user`,
          data: { userId },
        },
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );
  }

  async getUserIdByEmailLookup(
    email: NonNullable<User["email"]>,
  ): Promise<User["id"] | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          PK: `lookup_email_${email.toLowerCase()}`,
          SK: `user`,
        },
      }),
    );

    if (!result.Item) return null;

    return result.Item.data.userId as User["id"];
  }

  async updateEmailLookup(
    oldEmail: NonNullable<User["email"]>,
    newEmail: NonNullable<User["email"]>,
    userId: User["id"],
  ): Promise<void> {
    if (oldEmail.toLowerCase() === newEmail.toLowerCase()) {
      return;
    }

    await this.createEmailLookup(userId, newEmail);

    await this.deleteEmailLookup(oldEmail);
  }

  async deleteEmailLookup(email: NonNullable<User["email"]>): Promise<void> {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: {
          PK: `lookup_email_${email.toLowerCase()}`,
          SK: "user",
        },
      }),
    );
  }
}
