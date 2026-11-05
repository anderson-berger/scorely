import { ApiErrorSchema, type ErrorCode, TokensSchema } from '@scorely/contracts';
import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type { z } from 'zod';
import type { ClientErrorCode } from '@/i18n/locales/pt-BR';
import { session } from './session';

/**
 * Erro de uma chamada à API. `code` é o que importa: a tela traduz com `errorMessage(err)` (`@/i18n/errors`).
 * `message` é a mensagem técnica (em inglês), só para logs.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';

export const http = axios.create({ baseURL, headers: { 'content-type': 'application/json' } });

http.interceptors.request.use((config) => {
  const token = session.get()?.accessToken;
  if (token) config.headers.set('authorization', `Bearer ${token}`);
  return config;
});

// ── Sessão expirada ────────────────────────────────────────────────────────────
const expiry: { onExpired: () => void } = { onExpired: () => {} };
/** O app registra o que fazer quando a sessão não puder ser renovada (ex.: ir para o login). */
export const onSessionExpired = (fn: () => void) => {
  expiry.onExpired = fn;
};

// O web guarda só o par de tokens; o expiresIn não entra na sessão.
const RefreshResultSchema = TokensSchema.pick({ accessToken: true, refreshToken: true });

// Várias requisições podem receber 401 juntas: todas esperam o mesmo refresh.
const inFlight: { refresh?: Promise<boolean> } = {};
function refreshSession(): Promise<boolean> {
  inFlight.refresh ??= (async () => {
    const refreshToken = session.get()?.refreshToken;
    if (!refreshToken) return false;
    try {
      // axios "cru": sem os interceptors deste arquivo, para não entrar em loop.
      const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
      session.set(RefreshResultSchema.parse(data));
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    delete inFlight.refresh;
  });
  return inFlight.refresh;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function toApiError(err: AxiosError): ApiRequestError {
  const status = err.response?.status ?? 0;
  const parsed = ApiErrorSchema.safeParse(err.response?.data);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiRequestError(status, code, message, details);
  }
  // Sem resposta (rede/CORS/timeout) ou resposta fora do contrato (ex.: 403 do Gateway).
  return new ApiRequestError(status, status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR', err.message);
}

// Token recusado: 401, ou 403 vindo do authorizer do API Gateway (token inválido/expirado).
// O 403 do Gateway não tem o corpo `{ error }` da API, o que o separa de um 403 de regra de negócio.
function isTokenRejected(err: AxiosError): boolean {
  const status = err.response?.status;
  return status === 401 || (status === 403 && !ApiErrorSchema.safeParse(err.response?.data).success);
}

// Token recusado → tenta renovar uma vez e repete a requisição; falhou → encerra a sessão.
// Qualquer outra falha vira ApiRequestError (contrato de erro da API).
http.interceptors.response.use(undefined, async (err: unknown) => {
  if (!axios.isAxiosError(err)) throw err;
  const config = err.config as RetriableConfig | undefined;
  const hadSession = Boolean(session.get());
  if (isTokenRejected(err) && config && !config._retried && hadSession) {
    config._retried = true;
    if (await refreshSession()) return http.request(config);
    session.clear();
    expiry.onExpired();
  }
  throw toApiError(err);
});

/** Requisição tipada: valida a resposta com o schema Zod informado. */
export async function request<S extends z.ZodType>(
  config: AxiosRequestConfig,
  schema: S,
): Promise<z.infer<S>> {
  const { data } = await http.request<unknown>(config);
  return schema.parse(data);
}

/** Requisição sem corpo de resposta (204). */
export async function send(config: AxiosRequestConfig): Promise<void> {
  await http.request(config);
}
