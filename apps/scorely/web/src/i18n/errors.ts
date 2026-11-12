import { ErrorDetailsSchemas } from '@scorely/contracts';
import { i18n, t } from '@scorely/web/src/i18n/index';
import { ApiRequestError } from '@scorely/web/src/lib/http';

/**
 * Mensagem traduzida para um issue de validação do Zod:
 * `validation.<campo>.<código>` → `validation.<código>` → `errors.VALIDATION_ERROR`.
 * `field` substitui o caminho do issue (ex.: schema de um valor solto, sem `path`).
 */
export function issueMessage(
  issue: { code: string; path: readonly PropertyKey[] } | undefined,
  field = issue?.path.map(String).join('.') ?? '',
): string {
  if (!issue) return t('errors.VALIDATION_ERROR');
  const keys = field
    ? [`validation.${field}.${issue.code}`, `validation.${issue.code}`]
    : [`validation.${issue.code}`];
  const key = keys.find((k) => i18n.global.te(k));
  return key ? t(key) : t('errors.VALIDATION_ERROR');
}

/**
 * Mensagem para mostrar ao usuário a partir de qualquer erro. Nunca usa a `message` da API
 * (em inglês, só para devs): traduz pelo `code`, com os `details` como parâmetros.
 */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiRequestError)) return t('errors.UNKNOWN_ERROR');
  if (err.code === 'VALIDATION_ERROR') {
    const parsed = ErrorDetailsSchemas.VALIDATION_ERROR.safeParse(err.details);
    return issueMessage(parsed.success ? parsed.data.issues[0] : undefined);
  }
  const params =
    err.details && typeof err.details === 'object' ? (err.details as Record<string, unknown>) : {};
  return t(`errors.${err.code}`, params);
}
