import { UpdateMeInputSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/http';
import { errorMessage, issueMessage } from './errors';
import { i18n } from './index';

describe('errorMessage', () => {
  it('traduz pelo código, nunca usa a message (inglês) da api', () => {
    const err = new ApiRequestError(404, 'USER_NOT_FOUND', 'User not found');
    expect(errorMessage(err)).toBe('Usuário não encontrado');
  });

  it('usa os details como parâmetros', () => {
    const err = new ApiRequestError(429, 'AUTH_CODE_COOLDOWN', 'Wait…', { retryInSeconds: 42 });
    expect(errorMessage(err)).toBe('Aguarde 42s para pedir outro código');
  });

  it('VALIDATION_ERROR: traduz o primeiro issue', () => {
    const err = new ApiRequestError(422, 'VALIDATION_ERROR', 'Invalid data', {
      issues: [{ code: 'too_small', path: ['name'], message: 'Name is required' }],
    });
    expect(errorMessage(err)).toBe('Informe o nome');
  });

  it('erro que não veio da api → mensagem genérica', () => {
    expect(errorMessage(new Error('boom'))).toBe('Algo deu errado. Tente de novo');
  });

  it('segue o idioma ativo', () => {
    i18n.global.locale.value = 'en';
    expect(errorMessage(new ApiRequestError(404, 'USER_NOT_FOUND', 'x'))).toBe('User not found');
    i18n.global.locale.value = 'pt-BR';
  });
});

describe('issueMessage', () => {
  it('campo específico, depois genérico pelo código do Zod', () => {
    const parsed = UpdateMeInputSchema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
    expect(issueMessage(parsed.error?.issues[0])).toBe('Informe o nome');
    expect(issueMessage({ code: 'too_big', path: ['outro'] })).toBe('Valor muito longo');
  });

  it('field substitui o path (schema de valor solto)', () => {
    expect(issueMessage({ code: 'invalid_format', path: [] }, 'email')).toBe('Informe um email válido');
  });
});
