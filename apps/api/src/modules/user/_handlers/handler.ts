import { APIGatewayProxyResult } from "aws-lambda";

import { apiSuccess, apiError } from "@/utils/response/response";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/schemas/api-gateway.schemas";
import { $paginationQuery } from "@/utils/pagination/pagination";
import { UserService } from "../user/UserService";
import { $user } from "@/modules/user/user/user_schemas";

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
      case "PUT":
        return await update(event);
      case "GET":
        return await get(event);
      default:
        throw new BadRequestError("Método HTTP não suportado");
    }
  } catch (error) {
    return apiError(error);
  }
}

async function update(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  const body = JSON.parse(event.body || "{}");
  const data = $user.parse(body);

  const result = await userService.update(userId, data);

  return apiSuccess(result);
}

async function get(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const path = event.requestContext.http.path;
  const pathId = event.pathParameters?.id;

  if (path.endsWith("/me")) {
    const userId = getUserIdFromEvent(event);
    const user = await userService.findById(userId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  }

  if (pathId) {
    const user = await userService.findById(pathId);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  }

  const pagination = $paginationQuery.parse(event.queryStringParameters || {});
  const result = await userService.list(pagination);

  return apiSuccess(result);
}
