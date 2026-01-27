import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/utils/response/response";
import { BadRequestError, NotFoundError } from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/schemas/api-gateway.schemas";
import { $file } from "@scorely/shared/schemas/file";
import { parseRequestBody } from "@/utils/parse-body/parse-body";

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
      case "POST":
        return await post(event);

      default:
        throw new BadRequestError("Método HTTP não suportado");
    }
  } catch (error) {
    return apiError(error);
  }
}

async function post(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromEvent(event);
  const body = parseRequestBody(event.body);
  const data = $file.parse(body);

  const result = await userService.update(userId, data);

  return apiSuccess(result);
}
