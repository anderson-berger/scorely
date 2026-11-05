import type { MessageSchema } from './pt-BR';

export const en: MessageSchema = {
  errors: {
    VALIDATION_ERROR: 'Invalid data',
    INVALID_JSON: 'Invalid request',
    MISSING_PARAM: 'Incomplete request',
    INVALID_CURSOR: 'Could not load more items',
    INTERNAL_ERROR: 'Something went wrong on our side. Try again',
    UNAUTHORIZED: 'Sign in again to continue',
    SESSION_INVALID: 'Your session is no longer valid. Sign in again',
    SESSION_EXPIRED: 'Your session expired. Sign in again',
    AUTH_CODE_INVALID: 'Invalid or expired code',
    AUTH_CODE_COOLDOWN: 'Wait {retryInSeconds}s to request another code',
    AUTH_CODE_LIMIT: 'Too many codes requested. Try again later',
    USER_NOT_FOUND: 'User not found',
    USER_CREATE_CONFLICT: 'Could not create your account right now. Try again',
    NOTIFICATION_NOT_FOUND: 'Notification not found',
    NETWORK_ERROR: 'Cannot reach the server. Check your connection',
    UNKNOWN_ERROR: 'Something went wrong. Try again',
  },
  validation: {
    email: { invalid_format: 'Enter a valid email' },
    code: { invalid_format: 'The code has 6 digits' },
    name: { too_small: 'Enter your name', too_big: 'Name is too long' },
    nickname: { too_small: 'Nickname is empty', too_big: 'Nickname is too long' },
    invalid_type: 'Invalid value',
    invalid_format: 'Invalid format',
    invalid_value: 'Invalid value',
    too_small: 'Value is too short',
    too_big: 'Value is too long',
    custom: 'Invalid data',
  },
};
