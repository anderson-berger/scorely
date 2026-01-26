import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { apiError, apiSuccess } from "@/utils/response/response";
import {
  parseRequestBody,
  parseQueryString,
} from "@/utils/parse-body/parse-body";
import { AuthService } from "@/modules/auth/magic-link/AuthService";
import { $magicLink, $verify } from "@scorely/shared/schemas/auth";

const authService = new AuthService();

export async function handler(
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
    console.log("event", event);

    const query = parseQueryString(event.queryStringParameters);
    console.log("query", query);
    const { token } = $verify.parse(query);

    const result = await authService.verifyAndAuthenticate(token);

    return apiSuccess(result, 200);
  } catch (error) {
    return apiError(error);
  }
}
