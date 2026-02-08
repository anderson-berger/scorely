import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/utils/response/response";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/schemas/api-gateway.schemas";
import { $paginationQuery } from "@/utils/pagination/pagination";
import { UserService } from "@/modules/user/UserService";
import { $user } from "@/modules/user/user.schemas";

const userService = new UserService();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function getAuthenticatedUserId(
  event: AuthorizedAPIGatewayProxyEventV2,
): string {
  const userId = event.requestContext.authorizer?.lambda?.userId;

  if (!userId) {
    throw new UnauthorizedError("User not authenticated");
  }

  return userId;
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

// export async function create(
//   event: AuthorizedAPIGatewayProxyEventV2,
// ): Promise<APIGatewayProxyResult> {
//   try {
//     const body = JSON.parse(event.body || "{}");
//     const input = $user.parse(body);

//     const user = await userService.create(input);

//     return apiSuccess(user, 201);
//   } catch (error) {
//     return apiError(error);
//   }
// }

export async function getById(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.pathParameters?.id;

    if (!userId) {
      throw new BadRequestError("User ID is required");
    }

    const user = await userService.findById(userId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  } catch (error) {
    return apiError(error);
  }
}

export async function getByEmail(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const email = event.queryStringParameters?.email;

    if (!email) {
      throw new BadRequestError("Email is required");
    }

    const user = await userService.findByEmail(email);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  } catch (error) {
    return apiError(error);
  }
}

export async function list(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const query = event.queryStringParameters || {};
    const pagination = $paginationQuery.parse(query);

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
    const requestedBy = getAuthenticatedUserId(event);
    const userId = event.pathParameters?.id;

    if (!userId) {
      throw new BadRequestError("User ID is required");
    }

    const body = JSON.parse(event.body || "{}");
    const input = $user.parse(body);

    // CORRIGIDO: garantir que o ID do body seja o mesmo do path
    if (input.id !== userId) {
      throw new BadRequestError("User ID mismatch");
    }

    // CORRIGIDO: ordem dos parâmetros (requestedBy primeiro, depois user)
    const user = await userService.update(requestedBy, input);

    return apiSuccess(user);
  } catch (error) {
    return apiError(error);
  }
}

export async function remove(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthenticatedUserId(event);
    const userId = event.pathParameters?.id;

    if (!userId) {
      throw new BadRequestError("User ID is required");
    }

    await userService.delete(userId, requestedBy);

    return apiSuccess({ message: "User deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
