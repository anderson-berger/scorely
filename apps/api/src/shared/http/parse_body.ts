import { BadRequestError } from "@/utils/error/errors";

export function parseRequestBody<T = Record<string, unknown>>(
  body: string | null | undefined,
): T {
  if (!body) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new BadRequestError("Invalid JSON in request body");
  }
}

export function parseQueryString<T = Record<string, unknown>>(
  queryStringParameters: Record<string, string | undefined> | null,
): T {
  if (!queryStringParameters) {
    return {} as T;
  }

  return queryStringParameters as T;
}
