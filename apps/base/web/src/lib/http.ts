import axios, { type AxiosRequestConfig } from 'axios';
import { z } from 'zod';

/** Formato de erro retornado pela API. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  headers: { 'content-type': 'application/json' },
});

// Normaliza qualquer falha em ApiRequestError, usando o contrato de erro da API.
http.interceptors.response.use(undefined, (err: unknown) => {
  if (!axios.isAxiosError(err)) return Promise.reject(err);
  const status = err.response?.status ?? 0;
  const parsed = ApiErrorSchema.safeParse(err.response?.data);
  return Promise.reject(
    parsed.success
      ? new ApiRequestError(status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(status, err.code ?? 'UNKNOWN', err.message),
  );
});

/** Requisição tipada: valida a resposta com o schema Zod informado. */
export async function request<S extends z.ZodType>(
  config: AxiosRequestConfig,
  schema: S,
): Promise<z.infer<S>> {
  const { data } = await http.request<unknown>(config);
  return schema.parse(data);
}
