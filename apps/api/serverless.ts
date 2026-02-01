import type { AWS } from "@serverless/typescript";

import { authorizer } from "./serverless/functions/authorizer";
import { auth } from "./serverless/functions/auth";
import { user } from "./serverless/functions/user";
import { file } from "./serverless/functions/file";

// Configurações por ambiente
const stageConfig = {
  local: { frontendUrl: "http://localhost:9000" },
  dev: { frontendUrl: "${env:FRONTEND_URL, 'https://placeholder.cloudfront.net'}" },
  prod: { frontendUrl: "${env:FRONTEND_URL, 'https://placeholder.cloudfront.net'}" },
};

const getStageConfig = (key: keyof (typeof stageConfig)["local"]) =>
  `\${self:custom.stageConfig.\${self:provider.stage}.${key}}`;

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
      REGION: "${self:provider.region}",
      JWT_MAGIC_LINK_SECRET: "${env:JWT_MAGIC_LINK_SECRET, ''}",
      JWT_ACCESS_SECRET: "${env:JWT_ACCESS_SECRET, ''}",
      FRONTEND_URL: getStageConfig("frontendUrl"),
      S3_BUCKET: "scorely-uploads",
    },
    httpApi: {
      cors: {
        allowedOrigins: [getStageConfig("frontendUrl")],
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
          {
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            Resource:
              "arn:aws:s3:::${self:provider.environment.S3_BUCKET}-${self:provider.stage}/*",
          },
        ],
      },
    },
  },

  plugins: ["serverless-offline"],

  custom: {
    stageConfig,
    "serverless-offline": {
      httpPort: 3000,
    },
  },

  functions: {
    ...authorizer,
    ...auth,
    ...user,
    ...file,
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
          ],
        },
      },
    },
    Outputs: {
      HttpApiEndpoint: {
        Description: "HTTP API Gateway endpoint URL",
        Value: {
          "Fn::Sub":
            "https://${HttpApi}.execute-api.${AWS::Region}.amazonaws.com",
        },
        Export: {
          Name: "scorely-api-${self:provider.stage}-endpoint",
        },
      },
    },
  },
};

module.exports = serverlessConfiguration;
