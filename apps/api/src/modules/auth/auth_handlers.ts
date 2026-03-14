import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { apiError, apiSuccess } from "@/shared/http/response";
import { parseRequestBody, parseQueryString } from "@/shared/http/parse_body";
import {
  $sendMagicLinkInput,
  $verifyTokenInput,
} from "@/modules/auth/auth_schemas";
import * as authUseCases from "@/modules/auth/auth_usecases";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/shared/http/api_gateway_schemas";
import { UserService } from "@/modules/user/user_service";
import { NotFoundError, UnauthorizedError } from "@/shared/error/errors";
import { getAuthUserId } from "@/shared/http/auth_context";

const userService = new UserService();

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = parseRequestBody(event.body);
    const { email } = $sendMagicLinkInput.parse(body);

    const result = await authUseCases.sendMagicLink(email);

    return apiSuccess(result, 200);
  } catch (error) {
    return apiError(error);
  }
}

export async function verify(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const query = parseQueryString(event.queryStringParameters);
    const { token } = $verifyTokenInput.parse(query);

    const result = await authUseCases.verifyAndAuthenticate(token);

    return apiSuccess(result, 200);
  } catch (error) {
    return apiError(error);
  }
}

export async function me(
  event: AuthorizedAPIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult> {
  try {
    const requestedBy = getAuthUserId(event);

    const user = await userService.findById(requestedBy);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return apiSuccess(user);
  } catch (error) {
    return apiError(error);
  }
}
