import type { AWS } from "@serverless/typescript";

export const provider: AWS["provider"] = {
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
};
