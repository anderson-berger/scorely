import type { AWS } from "@serverless/typescript";

export const team: AWS["functions"] = {
  teams: {
    handler: "src/modules/team/handler.handler",
    events: [
      {
        httpApi: {
          path: "/api/teams",
          method: "post",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
