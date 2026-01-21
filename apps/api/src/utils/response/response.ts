import type { APIGatewayProxyResult } from "aws-lambda";
import { ZodError } from "zod";
import { AppError } from "../error/errors";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
};

export const apiSuccess = (
  data: any,
  statusCode = 200,
): APIGatewayProxyResult => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(data),
});

export const apiRedirect = (
  location: string,
  statusCode: 301 | 302 = 301,
): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    Location: location,
    "Cache-Control": "no-cache",
  },
  body: "",
});

export const apiError = (error: unknown): APIGatewayProxyResult => {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Validation error",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      }),
    };
  }

  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.name,
        message: error.message,
      }),
    };
  }

  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  };
};
