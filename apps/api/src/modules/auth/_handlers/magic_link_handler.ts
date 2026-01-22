import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { apiError, apiSuccess } from "@/utils/response/response";
import {
  parseRequestBody,
  parseQueryString,
} from "@/utils/parse-body/parse-body";
import { AuthService } from "@/modules/auth/magic-link/AuthService";
import { $magicLink, $verify } from "@/modules/auth/magic-link/auth_schemas";

const authService = new AuthService();

export async function magicLink(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = parseRequestBody(event.body);
    const { email } = $magicLink.parse(body);

    const result = await authService.sendMagicLink(email);

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
    const { token } = $verify.parse(query);

    const result = await authService.verifyAndAuthenticate(token);

    return apiSuccess(result, 200);
  } catch (error) {
    return apiError(error);
  }
}
