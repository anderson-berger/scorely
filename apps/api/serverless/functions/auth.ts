import type { AWS } from "@serverless/typescript";

export const auth: AWS["functions"] = {
  authMagicLink: {
    handler: "src/modules/auth/handler.magicLink",
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
          method: "post",
        },
      },
    ],
  },
};
