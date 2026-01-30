import type { AWS } from "@serverless/typescript";

export const user: AWS["functions"] = {
  user: {
    handler: "src/modules/user/handler.handler",
    events: [
      {
        httpApi: {
          path: "/api/user",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
      {
        httpApi: {
          path: "/api/user/{id}",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
      {
        httpApi: {
          path: "/api/user/{id}",
          method: "put",
          authorizer: { name: "authLambda" },
        },
      },
      {
        httpApi: {
          path: "/api/user/{id}",
          method: "delete",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
