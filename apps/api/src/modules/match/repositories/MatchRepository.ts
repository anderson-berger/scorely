import { Match } from "@/modules/match/match_types";
import { dynamoDBClient } from "@/shared/db/dynamodb_client";
import { BatchGetCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "@/utils/config/env";
import { $match } from "@/modules/match/match_schemas";
import { generateTimestamp } from "@/utils/generators";

const TABLE = env.TABLE;

export class MatchRepository {
  private getPK(matchId: Match["id"]): string {
    return `MATCH_${matchId}`;
  }

  async create(match: Match): Promise<Match> {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: this.getPK(match.id),
          SK: "MATCH",
          GSI1PK: "MATCHES",
          GSI1SK: `MATCH_${match.createdAt}`,
          data: match,
        },
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );
    return match;
  }

  async findById(id: Match["id"]): Promise<Match | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          PK: this.getPK(id),
          SK: "MATCH",
        },
      }),
    );

    if (!result.Item) return null;
    const match = $match.parse(result.Item.data);
    if (match.deletedAt) return null;
    return match;
  }

  async findByIds(ids: Match["id"][]): Promise<Match[]> {
    if (ids.length === 0) return [];

    const keys = ids.map((id) => ({
      PK: this.getPK(id),
      SK: "MATCH",
    }));

    const result = await dynamoDBClient.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE]: { Keys: keys },
        },
      }),
    );

    const items = result.Responses?.[TABLE] ?? [];

    return items
      .map((item) => $match.parse(item.data))
      .filter((match) => !match.deletedAt);
  }

  async delete(id: Match["id"]): Promise<void> {
    const now = generateTimestamp();
    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          PK: this.getPK(id),
          SK: "MATCH",
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
}
