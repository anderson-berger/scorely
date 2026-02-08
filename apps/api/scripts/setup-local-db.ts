import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";

const TABLE_NAME = "scorely-local";
const BUCKET_NAME = "scorely-uploads-local";
const ENDPOINT = "http://localstack:4566";

const awsConfig = {
  region: "sa-east-1",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
  forcePathStyle: true,
};

const dynamoClient = new DynamoDBClient(awsConfig);
const s3Client = new S3Client(awsConfig);

// DynamoDB functions
async function tableExists(): Promise<boolean> {
  try {
    await dynamoClient.send(
      new DescribeTableCommand({ TableName: TABLE_NAME }),
    );
    return true;
  } catch {
    return false;
  }
}

async function createTable(): Promise<void> {
  await dynamoClient.send(
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
    }),
  );
}

async function deleteTable(): Promise<void> {
  await dynamoClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
}

// S3 functions
async function bucketExists(): Promise<boolean> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    return true;
  } catch {
    return false;
  }
}

async function createBucket(): Promise<void> {
  await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));

  await s3Client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );

  // Política de leitura pública (simula CloudFront em prod)
  await s3Client.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${BUCKET_NAME}/*`,
          },
        ],
      }),
    }),
  );
}

async function main(): Promise<void> {
  const forceRecreate = process.argv.includes("--force");

  // Setup DynamoDB
  console.log(`🔍 Checking if table '${TABLE_NAME}' exists...`);

  if (await tableExists()) {
    if (forceRecreate) {
      console.log(`🗑️ Deleting table '${TABLE_NAME}'...`);
      await deleteTable();
      console.log(`⏳ Waiting for table deletion...`);
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      console.log(`✅ Table '${TABLE_NAME}' already exists`);
    }
  }

  if (!(await tableExists())) {
    console.log(`📦 Creating table '${TABLE_NAME}'...`);
    await createTable();
    console.log(`✅ Table '${TABLE_NAME}' created successfully`);
  }

  // Setup S3
  console.log(`🔍 Checking if bucket '${BUCKET_NAME}' exists...`);

  if (await bucketExists()) {
    console.log(`✅ Bucket '${BUCKET_NAME}' already exists`);
    console.log(`🔄 Updating bucket policies...`);
    await updateBucketPolicies();
    console.log(`✅ Bucket policies updated`);
  } else {
    console.log(`📦 Creating bucket '${BUCKET_NAME}'...`);
    await createBucket();
    console.log(`✅ Bucket '${BUCKET_NAME}' created with CORS and public read policy`);
  }
}

async function updateBucketPolicies(): Promise<void> {
  await s3Client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST"],
            AllowedOrigins: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );

  await s3Client.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${BUCKET_NAME}/*`,
          },
        ],
      }),
    }),
  );
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
