import { dbItem } from '@scorely/api/src/lib/db';
import {
  LOGIN_CODE_ENTITY,
  loginCodeKey,
  SESSION_ENTITY,
  sessionKey,
} from '@scorely/api/src/modules/auth/data/auth.table';
import { describe, expect, it } from 'vitest';

describe('auth.table', () => {
  it('AUTH-01: a chave do código normaliza o email (trim e minúsculas)', () => {
    expect(loginCodeKey('  Ana@X.com ')).toEqual(loginCodeKey('ana@x.com'));
    expect(loginCodeKey('Ana@X.com ').PK).toBe('AUTH#CODE#ana@x.com');
  });

  it('ADR 0013: o item do código não é entidade (sem updatedAt nem version), mas tem createdAt', () => {
    const item = dbItem(
      loginCodeKey('ana@x.com'),
      LOGIN_CODE_ENTITY,
      { email: 'ana@x.com' },
      '2026-11-20T10:00:00.000Z',
    );
    expect(item).toMatchObject({
      createdAt: '2026-11-20T10:00:00.000Z',
      entity: LOGIN_CODE_ENTITY,
    });
    expect(item).not.toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('version');
  });

  it('ADR 0013: o item da sessão não é entidade (sem updatedAt nem version), mas tem createdAt', () => {
    const item = dbItem(
      sessionKey('abc' as never),
      SESSION_ENTITY,
      { id: 'abc' },
      '2026-11-20T10:00:00.000Z',
    );
    expect(item).toMatchObject({
      createdAt: '2026-11-20T10:00:00.000Z',
      entity: SESSION_ENTITY,
    });
    expect(item).not.toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('version');
  });
});
