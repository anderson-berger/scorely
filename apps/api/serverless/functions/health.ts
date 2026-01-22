import type { AWS } from "@serverless/typescript";

export const health: AWS["functions"] = {
  health: {
    handler: "src/modules/health-check/handler.handler",
    events: [
      {
        httpApi: {
          path: "/api/health",
          method: "get",
        },
      },
    ],
  },
};
