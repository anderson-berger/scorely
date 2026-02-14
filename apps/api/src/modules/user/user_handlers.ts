import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/utils/http/response";
import { parseQueryString } from "@/utils/http/parse_body";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/http/api_gateway_schemas";
import { $paginationQuery } from "@/utils/pagination/pagination";
import { UserService } from "@/modules/user/user_service";
import { $user } from "@/modules/user/user_schemas";
import { getAuthUserId } from "@/utils/http/auth_context";

const userService = new UserService();

export async function getUsers(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const { id, email, limit, cursor } = parseQueryString<{
      id?: string;
      email?: string;
      limit?: string;
      cursor?: string;
    }>(event.queryStringParameters ?? null);

    // 1️⃣ GET BY ID (rota dedicada continua existindo, mas aqui pode suportar também)
    if (id) {
      const user = await userService.findById(id);
      if (!user) throw new NotFoundError("User not found");
      return apiSuccess(user);
    }

    // 2️⃣ GET BY EMAIL
    if (email) {
      const user = await userService.getUserByEmail(email);
      if (!user) throw new NotFoundError("User not found");
      return apiSuccess(user);
    }

    // 3️⃣ LIST (default)
    const pagination = $paginationQuery.parse({ limit, cursor });
    const result = await userService.list(pagination);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function update(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthUserId(event);
    const userId = event.pathParameters?.id;

    if (!userId) {
      throw new BadRequestError("User ID is required");
    }

    const body = JSON.parse(event.body || "{}");
    const input = $user.parse(body);

    if (input.id !== userId) {
      throw new BadRequestError("User ID mismatch");
    }

    const user = await userService.update(requestedBy, input);

    return apiSuccess(user);
  } catch (error) {
    return apiError(error);
  }
}

// export async function remove(
//   event: AuthorizedAPIGatewayProxyEventV2,
// ): Promise<APIGatewayProxyResult> {
//   try {
//     const requestedBy = getAuthUserId(event);
//     const userId = event.pathParameters?.id;

//     if (!userId) {
//       throw new BadRequestError("User ID is required");
//     }

//     await userService.delete(userId, requestedBy);

//     return apiSuccess({ message: "User deleted successfully" });
//   } catch (error) {
//     return apiError(error);
//   }
// }
