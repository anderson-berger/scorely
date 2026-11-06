import type { ErrorCode, ErrorDetails } from '@scorely/contracts';

/**
 * Status e mensagem (em inglês, para logs e devs) de cada código de erro.
 * O usuário nunca vê a `message`: o web traduz pelo `code`.
 * Faltou um código aqui → não compila.
 */
const CATALOG = {
  VALIDATION_ERROR: { status: 422, message: 'Invalid data' },
  INVALID_JSON: { status: 400, message: 'Body is not valid JSON' },
  MISSING_PARAM: { status: 400, message: 'Missing required path parameter' },
  INVALID_CURSOR: { status: 400, message: 'Invalid pagination cursor' },
  INTERNAL_ERROR: { status: 500, message: 'Internal error' },

  UNAUTHORIZED: { status: 401, message: 'Not authenticated' },
  SESSION_INVALID: { status: 401, message: 'Invalid session' },
  SESSION_EXPIRED: { status: 401, message: 'Session expired' },
  AUTH_CODE_INVALID: { status: 400, message: 'Invalid or expired login code' },
  AUTH_CODE_COOLDOWN: { status: 429, message: 'Wait before requesting another login code' },
  AUTH_CODE_LIMIT: { status: 429, message: 'Too many login codes requested; try again later' },

  USER_NOT_FOUND: { status: 404, message: 'User not found' },
  USER_CREATE_CONFLICT: {
    status: 409,
    message: 'Could not create the user due to a concurrent request; retry',
  },

  NOTIFICATION_NOT_FOUND: { status: 404, message: 'Notification not found' },

  GROUP_NOT_FOUND: { status: 404, message: 'Group not found' },
  GROUP_NOT_OWNER: { status: 403, message: 'Only the group owner can do this' },
  GROUP_INVITE_INVALID: { status: 404, message: 'Invalid or replaced invite link' },
  GROUP_MEMBER_NOT_FOUND: { status: 404, message: 'Member not found in this group' },
  GROUP_OWNER_NOT_REMOVABLE: { status: 409, message: 'The group owner cannot be removed' },
  GROUP_LAYERS_INVALID: { status: 422, message: 'Layers must open in order: members, reserves, guests' },

  GAME_NOT_FOUND: { status: 404, message: 'Game not found' },
  GAME_LIST_NOT_OPEN: { status: 409, message: 'The attendance list is not open yet' },
  GAME_CLOSED: { status: 409, message: 'The game has started or ended; the list is closed' },
  GAME_CANCELLED: { status: 409, message: 'The game was cancelled' },
  GAME_LINK_INVALID: { status: 404, message: 'Invalid or replaced game link' },
} as const satisfies Record<ErrorCode, { status: number; message: string }>;

/** Código com `details` obrigatório pede o objeto; os demais não aceitam nada. */
type DetailsArg<C extends ErrorCode> = C extends keyof ErrorDetails ? [details: ErrorDetails[C]] : [];

/** Erro esperado da API: vira `{ error: { code, message, details? } }` com o status do catálogo. */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(CATALOG[code].message);
    this.status = CATALOG[code].status;
  }
}

/**
 * Cria o erro de um código do catálogo. Use sempre isto para falhar de propósito:
 * `throw appError('USER_NOT_FOUND')`, `throw appError('AUTH_CODE_COOLDOWN', { retryInSeconds: 42 })`.
 */
export function appError<C extends ErrorCode>(code: C, ...details: DetailsArg<C>): AppError {
  return new AppError(code, details[0]);
}
