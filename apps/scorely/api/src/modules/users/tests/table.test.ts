import { dbItem } from '@scorely/api/src/lib/db';
import type { UserId } from '@scorely/api/src/lib/ids';
import {
  USER_ENTITY,
  USER_PREFERENCES_ENTITY,
  USER_PRIVATE_ENTITY,
  userEmailLookupKey,
  userKey,
  userPreferencesKey,
  userPrivateKey,
} from '@scorely/api/src/modules/users/data/users.table';
import { describe, expect, it } from 'vitest';

const ID = 'u1' as UserId;
const AT = '2026-11-20T10:00:00.000Z';

describe('user.table', () => {
  it('USR-01: a chave do lookup de email normaliza (trim e minúsculas)', () => {
    expect(userEmailLookupKey(' A@B.com ' as never)).toEqual({
      PK: 'LOOKUP#USER#EMAIL#a@b.com',
      SK: 'META',
    });
  });

  it('ADR 0013: o META é entidade (createdAt, updatedAt e version 1)', () => {
    const item = dbItem(userKey(ID), USER_ENTITY, { nickname: 'x' }, AT);
    expect(item).toMatchObject({ createdAt: AT, updatedAt: AT, version: 1 });
  });

  it('USR-13: o PRIVATE nasce só com createdAt (sem updatedAt nem version)', () => {
    const item = dbItem(userPrivateKey(ID), USER_PRIVATE_ENTITY, { email: 'a@b.com' }, AT);
    expect(item).toMatchObject({ createdAt: AT, email: 'a@b.com' });
    expect(item).not.toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('version');
  });

  it('USR-14: o PREFERENCES nasce só com createdAt (sem updatedAt nem version)', () => {
    const item = dbItem(userPreferencesKey(ID), USER_PREFERENCES_ENTITY, {}, AT);
    expect(item).toMatchObject({ createdAt: AT });
    expect(item).not.toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('version');
  });
});
