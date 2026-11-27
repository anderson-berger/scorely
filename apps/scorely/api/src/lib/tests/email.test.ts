import { normalizeEmail } from '@scorely/api/src/lib/email';
import { describe, expect, it } from 'vitest';

describe('normalizeEmail', () => {
  it('USR-01: tira espaços e põe em minúsculas', () => {
    expect(normalizeEmail('  Ana@X.com ')).toBe('ana@x.com');
  });
});
