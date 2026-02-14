import {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
} from "aws-lambda";
import { TokenService } from "@/shared/token/token_service";
import { UnauthorizedError } from "@/utils/error/errors";

const tokenService = new TokenService();

interface HttpApiAuthorizerEvent extends APIGatewayRequestAuthorizerEvent {
  routeArn?: string;
  routeKey?: string;
  rawPath?: string;
  identitySource?: string[];
  requestContext: any;
}

export async function handler(
  event: HttpApiAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> {
  try {
    const token = extractToken(event);
    const tokenPayload = await tokenService.verifyAccessToken(token);
    const resource = event.routeArn ?? event.routeKey ?? "*";

    return {
      principalId: String(tokenPayload.userId),
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect: "Allow",
            Resource: resource,
          },
        ],
      },
      context: {
        userId: tokenPayload.userId,
      },
    };
  } catch (err) {
    throw new UnauthorizedError();
  }
}

function extractToken(event: HttpApiAuthorizerEvent): string {
  const auth =
    event.headers?.Authorization ??
    event.headers?.authorization ??
    (event.identitySource && event.identitySource[0]) ??
    undefined;

  if (!auth) {
    throw new UnauthorizedError("Missing authorization header");
  }

  if (!auth.startsWith("Bearer ")) {
    throw new UnauthorizedError("Invalid authorization format");
  }

  const token = auth.slice(7).trim();

  if (!token) {
    throw new UnauthorizedError("Empty token");
  }

  return token;
}
