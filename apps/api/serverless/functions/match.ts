import type { AWS } from "@serverless/typescript";

export const match: AWS["functions"] = {
  matchCreate: {
    handler: "src/modules/match/match_handlers.create",
    events: [
      {
        httpApi: {
          path: "/api/matches",
          method: "post",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  matchFindMy: {
    handler: "src/modules/match/match_handlers.findMyMatches",
    events: [
      {
        httpApi: {
          path: "/api/matches/my",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  matchGetById: {
    handler: "src/modules/match/match_handlers.getById",
    events: [
      {
        httpApi: {
          path: "/api/matches/{id}",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  matchDelete: {
    handler: "src/modules/match/match_handlers.remove",
    events: [
      {
        httpApi: {
          path: "/api/matches/{id}",
          method: "delete",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  matchMemberList: {
    handler: "src/modules/match/match_member_handlers.list",
    events: [
      {
        httpApi: {
          path: "/api/matches/{id}/members",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  matchMemberAdd: {
    handler: "src/modules/match/match_member_handlers.add",
    events: [
      {
        httpApi: {
          path: "/api/matches/{id}/members",
          method: "post",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  matchMemberUpdateRole: {
    handler: "src/modules/match/match_member_handlers.updateRole",
    events: [
      {
        httpApi: {
          path: "/api/matches/{id}/members/{memberId}",
          method: "patch",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  matchMemberRemove: {
    handler: "src/modules/match/match_member_handlers.remove",
    events: [
      {
        httpApi: {
          path: "/api/matches/{id}/members/{memberId}",
          method: "delete",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
