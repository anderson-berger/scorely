import type { AWS } from "@serverless/typescript";

const serverlessConfiguration: AWS = {
  service: "scorely",
  frameworkVersion: "4",
  provider: {
    name: "aws",
    runtime: "nodejs20.x",
    region: "sa-east-1",
    stage: '${opt:stage, "local"}',
    environment: {
      TABLE: "${self:service}-${self:provider.stage}",
      STAGE: "${self:provider.stage}",
    },
    httpApi: {
      cors: {
        allowedOrigins: ["http://localhost:9000"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Accept",
          "Origin",
        ],
        allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowCredentials: true,
        maxAge: 300,
      },
      authorizers: {
        authLambda: {
          type: "request",
          functionName: "authorizer",
          identitySource: ["$request.header.Authorization"],
          enableSimpleResponses: false,
        },
      },
    },
    iam: {
      role: {
        statements: [
          {
            Effect: "Allow",
            Action: [
              "dynamodb:GetItem",
              "dynamodb:PutItem",
              "dynamodb:Query",
              "dynamodb:UpdateItem",
              "dynamodb:DeleteItem",
            ],
            Resource: [
              "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.TABLE}",
              "arn:aws:dynamodb:${self:provider.region}:*:table/${self:provider.environment.TABLE}/index/*",
            ],
          },
        ],
      },
    },
  },
  plugins: ["serverless-offline"],
  custom: {
    "serverless-offline": {
      httpPort: 3000,
    },
  },
  functions: {
    authorizer: {
      handler: "src/utils/middleware/authorize.handler",
      description: "JWT authorizer for HTTP API",
    },
    health: {
      handler: "src/modules/health-check/handler.handler",
      events: [
        {
          httpApi: {
            path: "/api/health",
            method: "get",
          },
        },
      ],
    },
    authMagicLink: {
      handler: "src/modules/auth/handler.magicLink",
      events: [
        {
          httpApi: {
            path: "/api/auth/magic-link",
            method: "post",
          },
        },
      ],
    },
    authVerify: {
      handler: "src/modules/auth/handler.verify",
      events: [
        {
          httpApi: {
            path: "/api/auth/verify",
            method: "post",
          },
        },
      ],
    },
    users: {
      handler: "src/modules/user/handler.handler",
      events: [
        {
          httpApi: {
            path: "/api/users/me",
            method: "get",
            authorizer: { name: "authLambda" },
          },
        },
        {
          httpApi: {
            path: "/api/users",
            method: "get",
            authorizer: { name: "authLambda" },
          },
        },
        {
          httpApi: {
            path: "/api/users/{id}",
            method: "get",
            authorizer: { name: "authLambda" },
          },
        },
        {
          httpApi: {
            path: "/api/users",
            method: "put",
            authorizer: { name: "authLambda" },
          },
        },
        {
          httpApi: {
            path: "/api/users",
            method: "patch",
            authorizer: { name: "authLambda" },
          },
        },
      ],
    },
  },
  resources: {
    Resources: {
      ScorelyTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "${self:provider.environment.TABLE}",
          BillingMode: "PAY_PER_REQUEST",
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
        },
      },
    },
  },
};

module.exports = serverlessConfiguration;
