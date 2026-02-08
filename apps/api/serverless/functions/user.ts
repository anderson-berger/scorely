import type { AWS } from "@serverless/typescript";

export const user: AWS["functions"] = {
  userGetById: {
    handler: "src/modules/user/handler.getById",
    events: [
      {
        httpApi: {
          path: "/api/users/{id}",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  userGetByEmail: {
    handler: "src/modules/user/handler.getByEmail",
    events: [
      {
        httpApi: {
          path: "/api/users/by-email",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  userList: {
    handler: "src/modules/user/handler.list",
    events: [
      {
        httpApi: {
          path: "/api/users",
          method: "get",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  userUpdate: {
    handler: "src/modules/user/handler.update",
    events: [
      {
        httpApi: {
          path: "/api/users/{id}",
          method: "put",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },

  userRemove: {
    handler: "src/modules/user/handler.remove",
    events: [
      {
        httpApi: {
          path: "/api/users/{id}",
          method: "delete",
          authorizer: { name: "authLambda" },
        },
      },
    ],
  },
};
