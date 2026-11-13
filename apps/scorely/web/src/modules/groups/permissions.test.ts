import { en } from '@scorely/web/src/i18n/locales/en';
import { ptBR } from '@scorely/web/src/i18n/locales/pt-BR';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import { isPermissionError, shouldRefresh } from '@scorely/web/src/modules/groups/permissions';
import { describe, expect, it } from 'vitest';

const MINUTE = 60_000;
const now = new Date('2026-11-13T12:00:00Z').getTime();

describe('isPermissionError', () => {
  it('GRP-57: ação barrada com GROUP_PERMISSION_DENIED → trata como permissão perdida', () => {
    const err = new ApiRequestError(403, 'GROUP_PERMISSION_DENIED', 'Permission denied');
    expect(isPermissionError(err)).toBe(true);
  });

  it('GRP-57: ação barrada com GROUP_NOT_OWNER → trata como permissão perdida', () => {
    const err = new ApiRequestError(403, 'GROUP_NOT_OWNER', 'Not the owner');
    expect(isPermissionError(err)).toBe(true);
  });

  it('GRP-57: outro erro da api segue com a mensagem dele', () => {
    expect(isPermissionError(new ApiRequestError(404, 'GROUP_NOT_FOUND', 'Not found'))).toBe(false);
    expect(isPermissionError(new ApiRequestError(0, 'NETWORK_ERROR', 'Network'))).toBe(false);
  });

  it('GRP-57: erro que não veio da api não é de permissão', () => {
    expect(isPermissionError(new Error('GROUP_PERMISSION_DENIED'))).toBe(false);
    expect(isPermissionError(undefined)).toBe(false);
    expect(isPermissionError({ code: 'GROUP_PERMISSION_DENIED' })).toBe(false);
  });
});

describe('shouldRefresh', () => {
  it('GRP-57: volta para a aba com a última leitura há 1 min ou mais → relê', () => {
    expect(shouldRefresh(now - MINUTE, now, false)).toBe(true);
    expect(shouldRefresh(now - 10 * MINUTE, now, false)).toBe(true);
  });

  it('GRP-57: volta para a aba antes de 1 min → não relê', () => {
    expect(shouldRefresh(now - (MINUTE - 1), now, false)).toBe(false);
    expect(shouldRefresh(now, now, false)).toBe(false);
  });

  it('GRP-57: nunca há duas leituras ao mesmo tempo', () => {
    expect(shouldRefresh(now - 10 * MINUTE, now, true)).toBe(false);
    expect(shouldRefresh(undefined, now, true)).toBe(false);
  });

  it('GRP-57: sem leitura anterior → relê', () => {
    expect(shouldRefresh(undefined, now, false)).toBe(true);
  });
});

describe('mensagem de permissão perdida', () => {
  it('GRP-57: "Suas permissões neste grupo mudaram", com tradução em inglês', () => {
    expect((ptBR.groups as Record<string, unknown>).permissionsChanged).toBe(
      'Suas permissões neste grupo mudaram',
    );
    const enText = (en.groups as Record<string, unknown>).permissionsChanged;
    expect(typeof enText).toBe('string');
    expect(enText).not.toBe('');
  });
});
