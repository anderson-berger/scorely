import type { AWS } from "@serverless/typescript";

export const user: AWS["functions"] = {
  user: {
    handler: "src/modules/user/_handlers/user_handler.handler",
    events: [
      {
        httpApi: {
          path: "/api/user/me",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
      {
        httpApi: {
          path: "/api/user/me",
          method: "put",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
