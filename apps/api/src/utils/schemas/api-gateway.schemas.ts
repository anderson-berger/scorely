import type { APIGatewayProxyEventV2 } from "aws-lambda";

export interface AuthorizerContext {
  userId: string;
  email: string;
}

export interface AuthorizedAPIGatewayProxyEventV2
  extends Omit<APIGatewayProxyEventV2, "requestContext"> {
  requestContext: APIGatewayProxyEventV2["requestContext"] & {
    authorizer?: {
      lambda?: AuthorizerContext;
    };
    http: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
  };
}
