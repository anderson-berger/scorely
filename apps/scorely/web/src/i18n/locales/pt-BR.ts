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
    GROUP_NOT_FOUND: 'Grupo não encontrado',
    GROUP_NOT_OWNER: 'Só o dono do grupo pode fazer isso',
    GROUP_INVITE_INVALID: 'Este link de convite não vale mais. Peça um novo ao dono do grupo',
    GROUP_MEMBER_NOT_FOUND: 'Essa pessoa não é membro do grupo',
    GROUP_OWNER_NOT_REMOVABLE: 'O dono não pode ser removido do grupo',
    GAME_NOT_FOUND: 'Jogo não encontrado',
    GAME_LIST_NOT_OPEN: 'A lista deste jogo ainda não abriu',
    GAME_CLOSED: 'O jogo já começou: a lista está fechada',
    GAME_CANCELLED: 'Este jogo foi cancelado',
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
    timeZone: { custom: 'Fuso horário inválido' },
    locale: { invalid_value: 'Idioma inválido' },
    invalid_type: 'Valor inválido',
    invalid_format: 'Formato inválido',
    invalid_value: 'Valor inválido',
    too_small: 'Valor muito curto',
    too_big: 'Valor muito longo',
    custom: 'Dados inválidos',
  },
  app: { name: 'scorely' },
  login: {
    tagline: 'Organize os jogos do seu grupo',
    email: 'Seu email',
    sendCode: 'Receber código',
    codeSent: 'Enviamos um código de 6 dígitos para',
    code: 'Código',
    enter: 'Entrar',
    changeEmail: 'Trocar email',
    resendIn: 'Reenviar em {seconds}s',
    resend: 'Reenviar código',
  },
  layout: { account: 'Conta', profile: 'Perfil', logout: 'Sair' },
  home: {
    greeting: 'Olá, {name}!',
    greetingAnonymous: 'Olá!',
    groupsPlaceholder: 'Seus grupos vão aparecer aqui.',
  },
  profile: {
    welcomeTitle: 'Bem-vindo!',
    title: 'Seu perfil',
    welcomeHint: 'Conte como você quer aparecer nos grupos.',
    name: 'Nome',
    nickname: 'Apelido (opcional)',
    nicknameHint: 'É o nome que aparece nas listas',
    gender: 'Gênero',
    genderHint: 'Usado para montar times equilibrados em grupos mistos.',
    genderM: 'Masculino',
    genderF: 'Feminino',
    language: 'Idioma',
    timeZone: 'Fuso horário',
    timeZoneHint: 'Os horários aparecem neste fuso',
    saved: 'Perfil salvo',
    continue: 'Continuar',
    save: 'Salvar',
  },
  locales: { 'pt-BR': 'Português (Brasil)', en: 'English' },
  notifications: {
    label: 'Notificações',
    title: 'Notificações',
    markAllRead: 'Marcar todas como lidas',
    empty: 'Nada por aqui ainda',
    more: 'Ver mais',
    remove: 'Apagar notificação',
  },
};

export type MessageSchema = typeof ptBR;
