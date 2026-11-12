import { AppError, appError } from '@scorely/api/src/lib/errors';
import type { ApiError, ValidationIssue } from '@scorely/contracts';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ZodError, type z } from 'zod';

/** Path param obrigatório. */
export function pathParam(event: APIGatewayProxyEventV2, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) throw appError('MISSING_PARAM', { param: name });
  return value;
}

function json(status: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function errorResult(err: AppError, requestId?: string): APIGatewayProxyStructuredResultV2 {
  const body: ApiError = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
      ...(requestId !== undefined && { requestId }),
    },
  };
  return json(err.status, body);
}

/** Converte qualquer erro lançado no handler na resposta padronizada. */
function toErrorResult(err: unknown, event: APIGatewayProxyEventV2): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ZodError) return errorResult(appError('VALIDATION_ERROR', { issues: toIssues(err) }));
  if (err instanceof AppError) return errorResult(err);
  // Bug ou falha de infra: loga estruturado e responde 500 sem detalhes, com o id para achar o log.
  const requestId = event.requestContext?.requestId;
  console.error(
    JSON.stringify({
      level: 'error',
      code: 'INTERNAL_ERROR',
      requestId,
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );
  return errorResult(appError('INTERNAL_ERROR'), requestId);
}

function toIssues(err: ZodError): ValidationIssue[] {
  return err.issues.map((i) => ({
    code: i.code,
    path: i.path.filter((p): p is string | number => typeof p !== 'symbol'),
    message: i.message,
  }));
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
    throw appError('INVALID_JSON');
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
