import type { AWS } from "@serverless/typescript";

export const user: AWS["functions"] = {
  userGet: {
    handler: "src/modules/user/user_handlers.getUsers",
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
    handler: "src/modules/user/user_handlers.update",
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

  // userRemove: {
  //   handler: "src/modules/user/infrastructure/user_handlers.remove",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/api/users/{id}",
  //         method: "delete",
  //         authorizer: { name: "authLambda" },
  //       },
  //     },
  //   ],
  // },
  // userList: {
  //   handler: "src/modules/user/infrastructure/user_handlers.list",
  //   events: [
  //     {
  //       httpApi: {
  //         path: "/api/users",
  //         method: "get",
  //         authorizer: { name: "authLambda" },
  //       },
  //     },
  //   ],
  // },
};
