import { BadRequestError } from "@/utils/error/errors";

/**
 * Safely parses JSON request body from API Gateway event.
 * Throws BadRequestError (400) if JSON is malformed.
 */
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
