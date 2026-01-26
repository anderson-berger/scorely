import type { AWS } from "@serverless/typescript";

export const auth: AWS["functions"] = {
  authMagicLink: {
    handler: "src/modules/auth/_handlers/magic_link_handler.handler",
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
    handler: "src/modules/auth/_handlers/magic_link_handler.verify",
    events: [
      {
        httpApi: {
          path: "/api/auth/verify",
          method: "get",
        },
      },
    ],
  },
};
