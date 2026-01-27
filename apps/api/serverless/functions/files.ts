import type { AWS } from "@serverless/typescript";

export const user: AWS["functions"] = {
  users: {
    handler: "src/modules/file/_handlers/file_handler.handler",
    events: [
      {
        httpApi: {
          path: "/api/file/presign",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
