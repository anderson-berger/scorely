import { env } from '@scorely/api/src/lib/env';
import { appError } from '@scorely/api/src/lib/errors';
import { type HttpEvent, type HttpResult, route } from '@scorely/api/src/lib/http';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import { verifyJwt } from '@scorely/api/src/lib/jwt';
import type {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';

/** Quem está chamando: vem do access token, validado pelo authorizer do API Gateway. */
export interface AuthContext {
  /** Id do sistema (USR-16): fica no token, nunca sai na resposta. */
  userId: UserId;
  sessionId: string;
}

/** Nome do authorizer em `provider.httpApi.authorizers`. Use nas rotas: `authorizer: { name: AUTHORIZER }`. */
export const AUTHORIZER = 'auth';

/** Valida um `Authorization: Bearer <jwt>`. Devolve quem é o usuário, ou `undefined` se o token não serve. */
export function verifyBearer(
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): AuthContext | undefined {
  const [scheme, token] = (header ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  const claims = verifyJwt(token, secret, nowSeconds);
  return claims && { userId: asUserId(claims.sub), sessionId: claims.sid };
}

/**
 * Lambda authorizer do HTTP API (payload 2.0, resposta simples).
 * Token inválido ou expirado → o API Gateway responde 403 sem chamar a rota.
 */
export async function authorizer(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext | Record<string, never>>> {
  const auth = verifyBearer(event.headers?.authorization, env().AUTH_SECRET);
  return auth ? { isAuthorized: true, context: auth } : { isAuthorized: false, context: {} };
}

type AuthedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<Partial<AuthContext>>;

/**
 * Como o `route`, para rota com authorizer: entrega o `AuthContext` que o authorizer deixou no evento.
 * Não valida token: a rota precisa declarar `authorizer: { name: AUTHORIZER }` no `functions.ts`.
 * Sem o contexto (rota sem authorizer), responde 401 em vez de rodar sem usuário.
 */
export async function authRoute(
  event: HttpEvent,
  fn: (auth: AuthContext) => Promise<unknown>,
): Promise<HttpResult> {
  return route(event, async () => {
    const ctx = (event as AuthedEvent).requestContext.authorizer?.lambda;
    if (!ctx?.userId || !ctx.sessionId) throw appError('UNAUTHORIZED');
    return fn({ userId: asUserId(ctx.userId), sessionId: ctx.sessionId });
  });
}
