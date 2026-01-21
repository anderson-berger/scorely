import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

const TABLE_NAME = "scorely-local";
const ENDPOINT = "http://localstack:4566";

const client = new DynamoDBClient({
  region: "sa-east-1",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

async function tableExists(): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch {
    return false;
  }
}

async function createTable(): Promise<void> {
  await client.send(
    new CreateTableCommand({
      TableName: TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
        { AttributeName: "GSI2PK", AttributeType: "S" },
        { AttributeName: "GSI2SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "GSI2",
          KeySchema: [
            { AttributeName: "GSI2PK", KeyType: "HASH" },
            { AttributeName: "GSI2SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    })
  );
}

async function deleteTable(): Promise<void> {
  await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
}

async function main(): Promise<void> {
  const forceRecreate = process.argv.includes("--force");

  console.log(`🔍 Checking if table '${TABLE_NAME}' exists...`);

  if (await tableExists()) {
    if (forceRecreate) {
      console.log(`🗑️ Deleting table '${TABLE_NAME}'...`);
      await deleteTable();
      console.log(`⏳ Waiting for table deletion...`);
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      console.log(`✅ Table '${TABLE_NAME}' already exists`);
      return;
    }
  }

  console.log(`📦 Creating table '${TABLE_NAME}'...`);
  await createTable();
  console.log(`✅ Table '${TABLE_NAME}' created successfully`);
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
