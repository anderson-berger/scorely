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

function getUserIdFromEvent(event: AuthorizedAPIGatewayProxyEventV2): string {
  const userId = event.requestContext.authorizer?.lambda?.userId;

  if (!userId) {
    throw new UnauthorizedError("User not authenticated");
  }

  return userId;
}

export async function handler(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const method = event.requestContext.http.method;

    switch (method) {
      case "GET":
        return await get(event);
      case "PUT":
        return await update(event);
      case "DELETE":
        return await remove(event);
      default:
        throw new BadRequestError("Unsupported HTTP method");
    }
  } catch (error) {
    return apiError(error);
  }
}

async function get(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const pathId = event.pathParameters?.id;
  const query = event.queryStringParameters || {};

  if (pathId) {
    const user = await userService.findById(pathId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  }

  if (query.email) {
    const user = await userService.findByEmail(query.email);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  }

  if (query.nickname) {
    const user = await userService.findByNickname(query.nickname);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  }

  const pagination = $paginationQuery.parse(query);
  const result = await userService.list(pagination);

  return apiSuccess(result);
}

async function update(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const requestedBy = getUserIdFromEvent(event);
  const pathId = event.pathParameters?.id;

  if (!pathId) {
    throw new BadRequestError("User ID is required");
  }

  const body = JSON.parse(event.body || "{}");
  const input = $user.parse(body);

  const user = await userService.update(pathId, requestedBy, input);

  return apiSuccess(user);
}

async function remove(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  const pathId = event.pathParameters?.id;

  if (!pathId) {
    throw new BadRequestError("User ID is required");
  }

  await userService.delete(pathId, userId);

  return apiSuccess({ message: "User deleted successfully" });
}
