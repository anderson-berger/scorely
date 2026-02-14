import type { AWS } from "@serverless/typescript";

export const authorizer: AWS["functions"] = {
  authorizer: {
    handler: "src/modules/authorizer/authorizer_handler.handler",
    description: "JWT authorizer for HTTP API",
  },
};
