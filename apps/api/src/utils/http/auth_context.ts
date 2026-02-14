import { UnauthorizedError } from "@/utils/error/errors";
import { AuthorizedAPIGatewayProxyEventV2 } from "@/utils/http/api_gateway_schemas";

export function getAuthUserId(event: AuthorizedAPIGatewayProxyEventV2): string {
  const userId = event.requestContext.authorizer?.lambda?.userId;

  if (!userId) {
    throw new UnauthorizedError("User not authenticated");
  }

  return userId;
}
