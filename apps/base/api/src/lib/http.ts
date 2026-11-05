import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ZodError, z } from 'zod';

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(what: string) {
  return new HttpError(404, 'NOT_FOUND', `${what} não encontrado`);
}

function json(status: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details !== undefined && { details }) } };
}

/** Faz o parse do body JSON com um schema Zod. */
export function parseBody<S extends z.ZodType>(event: APIGatewayProxyEventV2, schema: S): z.infer<S> {
  return schema.parse(parseJson(event.body));
}

function parseJson(body: string | undefined): unknown {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Body não é um JSON válido');
  }
}

/**
 * Resposta com status fora do padrão. O normal é o handler devolver só os dados:
 * valor → 200 com JSON; nada (`undefined`) → 204. Para outro status, devolva um `HttpResponse`.
 */
export class HttpResponse {
  constructor(
    readonly status: number,
    readonly body?: unknown,
  ) {}
}

export function created(body: unknown) {
  return new HttpResponse(201, body);
}

/** O que o handler escreve: devolve os dados da resposta (ou nada) e lança `HttpError` para falhar. */
export type Handler = (event: APIGatewayProxyEventV2) => Promise<unknown>;
export type LambdaHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;

function toResult(value: unknown): APIGatewayProxyStructuredResultV2 {
  if (value instanceof HttpResponse) {
    return value.body === undefined ? { statusCode: value.status } : json(value.status, value.body);
  }
  return value === undefined ? { statusCode: 204 } : json(200, value);
}

/** Envelopa um handler: o retorno vira a resposta HTTP e os erros, respostas padronizadas. */
export function handler(fn: Handler): LambdaHandler {
  return async (event) => {
    try {
      return toResult(await fn(event));
    } catch (err) {
      if (err instanceof ZodError) {
        return json(422, errorBody('VALIDATION_ERROR', 'Dados inválidos', err.issues));
      }
      if (err instanceof HttpError) {
        return json(err.status, errorBody(err.code, err.message));
      }
      console.error(err);
      return json(500, errorBody('INTERNAL_ERROR', 'Erro interno'));
    }
  };
}

/**
 * Envelopa vários handlers de uma vez, escritos como métodos de um objeto (padrão dos `handlers.ts`).
 * Exporte cada um pelo nome que o `functions.ts` usa: `export const { list, get } = handlers({ ... })`.
 */
export function handlers<T extends Record<string, Handler>>(methods: T): { [K in keyof T]: LambdaHandler } {
  const wrapped: Record<string, LambdaHandler> = {};
  for (const [name, fn] of Object.entries(methods)) wrapped[name] = handler(fn);
  return wrapped as { [K in keyof T]: LambdaHandler };
}
