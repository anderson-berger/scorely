import type { AWS } from "@serverless/typescript";

export const team: AWS["functions"] = {
  // Team endpoints
  teamCreate: {
    handler: "src/modules/team/team/handler.create",
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

  teamGetById: {
    handler: "src/modules/team/team/handler.getById",
    events: [
      {
        httpApi: {
          path: "/api/teams/{id}",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  teamUpdate: {
    handler: "src/modules/team/team/handler.update",
    events: [
      {
        httpApi: {
          path: "/api/teams/{id}",
          method: "patch",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  teamDelete: {
    handler: "src/modules/team/team/handler.remove",
    events: [
      {
        httpApi: {
          path: "/api/teams/{id}",
          method: "delete",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  // Member endpoints
  memberGetMyTeams: {
    handler: "src/modules/team/member/handler.getMyTeams",
    events: [
      {
        httpApi: {
          path: "/api/teams/my",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  memberList: {
    handler: "src/modules/team/member/handler.list",
    events: [
      {
        httpApi: {
          path: "/api/teams/{id}/members",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  memberAdd: {
    handler: "src/modules/team/member/handler.add",
    events: [
      {
        httpApi: {
          path: "/api/teams/{id}/members",
          method: "post",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  memberUpdate: {
    handler: "src/modules/team/member/handler.update",
    events: [
      {
        httpApi: {
          path: "/api/teams/{id}/members/{userId}",
          method: "patch",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  memberRemove: {
    handler: "src/modules/team/member/handler.remove",
    events: [
      {
        httpApi: {
          path: "/api/teams/{id}/members/{userId}",
          method: "delete",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
