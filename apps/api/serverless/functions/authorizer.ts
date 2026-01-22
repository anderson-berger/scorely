import type { AWS } from "@serverless/typescript";

export const authorizer: AWS["functions"] = {
  authorizer: {
    handler: "src/utils/middleware/authorize.handler",
    description: "JWT authorizer for HTTP API",
  },
};
