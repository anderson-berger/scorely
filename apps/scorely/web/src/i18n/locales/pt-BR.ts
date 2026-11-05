import type { ErrorCode } from '@scorely/contracts';

/** Códigos de erro do web, além dos da API. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'UNKNOWN_ERROR';

/** Idioma base: define as chaves. Os outros idiomas precisam ter exatamente as mesmas. */
export const ptBR = {
  errors: {
    VALIDATION_ERROR: 'Dados inválidos',
    INVALID_JSON: 'Requisição inválida',
    MISSING_PARAM: 'Requisição incompleta',
    INVALID_CURSOR: 'Não foi possível carregar mais itens',
    INTERNAL_ERROR: 'Algo deu errado do nosso lado. Tente de novo',
    UNAUTHORIZED: 'Entre de novo para continuar',
    SESSION_INVALID: 'Sua sessão não é mais válida. Entre de novo',
    SESSION_EXPIRED: 'Sua sessão expirou. Entre de novo',
    AUTH_CODE_INVALID: 'Código inválido ou expirado',
    AUTH_CODE_COOLDOWN: 'Aguarde {retryInSeconds}s para pedir outro código',
    AUTH_CODE_LIMIT: 'Muitos códigos pedidos. Tente de novo mais tarde',
    USER_NOT_FOUND: 'Usuário não encontrado',
    USER_CREATE_CONFLICT: 'Não foi possível criar sua conta agora. Tente de novo',
    NOTIFICATION_NOT_FOUND: 'Notificação não encontrada',
    NETWORK_ERROR: 'Sem conexão com o servidor. Verifique sua internet',
    UNKNOWN_ERROR: 'Algo deu errado. Tente de novo',
  } satisfies Record<ErrorCode | ClientErrorCode, string>,

  /**
   * Validação: `validation.<campo>.<código do Zod>` e, se não houver, `validation.<código do Zod>`.
   * Os schemas do contracts têm mensagens em inglês só para a api; quem o usuário vê é isto.
   */
  validation: {
    email: { invalid_format: 'Informe um email válido' },
    code: { invalid_format: 'O código tem 6 dígitos' },
    name: { too_small: 'Informe o nome', too_big: 'Nome muito longo' },
    nickname: { too_small: 'Apelido vazio', too_big: 'Apelido muito longo' },
    invalid_type: 'Valor inválido',
    invalid_format: 'Formato inválido',
    invalid_value: 'Valor inválido',
    too_small: 'Valor muito curto',
    too_big: 'Valor muito longo',
    custom: 'Dados inválidos',
  },
};

export type MessageSchema = typeof ptBR;
