import { APIGatewayProxyResult } from "aws-lambda";
import { apiSuccess, apiError } from "@/utils/response/response";
import { BadRequestError, UnauthorizedError } from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/schemas/api-gateway.schemas";
import { $presignedUrlRequest } from "@scorely/shared/schemas/file/file_schemas";
import { parseRequestBody } from "@/utils/parse-body/parse-body";
import { FileService } from "../file/FileService";

const fileService = new FileService();

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
  const data = $presignedUrlRequest.parse(body);

  const result = await fileService.generatePresignedUrl(userId, data);

  return apiSuccess(result);
}
