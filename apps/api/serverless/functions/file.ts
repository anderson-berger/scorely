import type { AWS } from "@serverless/typescript";

export const file: AWS["functions"] = {
  file: {
    handler: "src/modules/file/_handlers/file_handler.handler",
    events: [
      {
        httpApi: {
          path: "/api/file/presign",
          method: "post",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
