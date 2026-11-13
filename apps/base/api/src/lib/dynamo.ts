import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { env } from '@base/api/src/lib/env';
import { lazy } from '@base/api/src/lib/fn';

const client = lazy(() => {
  const { AWS_REGION, DYNAMODB_ENDPOINT } = env();
  const base = new DynamoDBClient({
    region: AWS_REGION,
    ...(DYNAMODB_ENDPOINT && {
      endpoint: DYNAMODB_ENDPOINT,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    }),
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
});

/** Document client único por container Lambda. Usa o DynamoDB Local quando DYNAMODB_ENDPOINT existe. */
export function dynamo(): DynamoDBDocumentClient {
  return client();
}

export function tableName() {
  return env().TABLE_NAME;
}
