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

/** Evento da rota HTTP (payload 2.0): o único parâmetro anotado nos `handlers.ts`. */
export type HttpEvent = APIGatewayProxyEventV2;
export type HttpResult = APIGatewayProxyStructuredResultV2;

function toResult(value: unknown): HttpResult {
  if (value instanceof HttpResponse) {
    return value.body === undefined ? { statusCode: value.status } : json(value.status, value.body);
  }
  return value === undefined ? { statusCode: 204 } : json(200, value);
}

/** Converte qualquer erro lançado na rota na resposta padronizada. */
function toErrorResult(err: unknown, _event: HttpEvent): HttpResult {
  if (err instanceof ZodError) return json(422, errorBody('VALIDATION_ERROR', 'Dados inválidos', err.issues));
  if (err instanceof HttpError) return json(err.status, errorBody(err.code, err.message));
  console.error(err);
  return json(500, errorBody('INTERNAL_ERROR', 'Erro interno'));
}

/**
 * Responde uma rota (padrão dos `handlers.ts`): roda `fn`, e o retorno vira a resposta HTTP e os erros,
 * respostas padronizadas. `export async function list(event: HttpEvent) { return route(event, async () => ...) }`
 */
export async function route(event: HttpEvent, fn: () => Promise<unknown>): Promise<HttpResult> {
  try {
    return toResult(await fn());
  } catch (err) {
    return toErrorResult(err, event);
  }
}
