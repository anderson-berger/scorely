import type { AWS } from "@serverless/typescript";

export const auth: AWS["functions"] = {
  authMagicLink: {
    handler: "src/modules/auth/handler.handler",
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
          method: "get",
        },
      },
    ],
  },

  authMe: {
    handler: "src/modules/auth/handler.me",
    events: [
      {
        httpApi: {
          path: "/api/auth/me",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
