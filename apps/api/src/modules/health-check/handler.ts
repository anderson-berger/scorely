import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { apiError, apiSuccess } from "@/utils/response/response";
import { env } from "@/utils/config/env";

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const result = {
      status: "ok",
      timestamp: new Date().toISOString(),
      stage: env.STAGE,
      table: env.TABLE,
    };

    return apiSuccess(result, 200);
  } catch (error) {
    return apiError(error);
  }
}
