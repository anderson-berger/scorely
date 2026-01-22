import type { AWS } from "@serverless/typescript";

export const user: AWS["functions"] = {
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
          path: "/api/users/me",
          method: "put",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
