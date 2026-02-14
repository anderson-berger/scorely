import type { AWS } from "@serverless/typescript";

export const auth: AWS["functions"] = {
  authMagicLink: {
    handler: "src/modules/auth/auth_handlers.handler",
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
    handler: "src/modules/auth/auth_handlers.verify",
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
    handler: "src/modules/user/user_handlers.me",
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
