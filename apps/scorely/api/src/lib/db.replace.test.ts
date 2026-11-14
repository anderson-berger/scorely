import { replaceItem } from '@scorely/api/src/lib/db';
import { describe, expect, it } from 'vitest';

// ADR 0013: substituir a entidade inteira é um `Update` que soma a `version`, nunca um `Put` que a volta para 1.

const key = { PK: 'TEAMS#g#2026-11-14', SK: 'META' };

describe('replaceItem (ADR 0013)', () => {
  it('ADR 0013: grava cada campo, mantém o createdAt da 1ª gravação e soma 1 na version', () => {
    const u = replaceItem(key, 'Teams', { status: 'draft', createdAt: '2026-11-01T00:00:00.000Z' });
    expect(u.Key).toEqual(key);
    expect(u.UpdateExpression).toContain('createdAt = if_not_exists(createdAt, :createdAt)');
    expect(u.UpdateExpression).toContain('#f_status = :f_status');
    expect(u.UpdateExpression).toContain('ADD version :versionStep');
    expect(u.ExpressionAttributeValues).toMatchObject({
      ':f_status': 'draft',
      ':createdAt': '2026-11-01T00:00:00.000Z',
      ':versionStep': 1,
    });
  });

  it('ADR 0013: sem updatedAt em data, grava o instante da alteração', () => {
    const before = Date.now();
    const u = replaceItem(key, 'Teams', { status: 'draft' });
    const at = Date.parse(u.ExpressionAttributeValues[':updatedAt'] as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('ADR 0013: apaga os opcionais ausentes e nunca grava version, updatedAt ou chaves vindos de data', () => {
    const u = replaceItem(key, 'Teams', { status: 'draft', version: 7, PK: 'X', pinned: undefined }, [
      'pinned',
    ]);
    expect(u.UpdateExpression).toMatch(/REMOVE #f_pinned/);
    expect(u.UpdateExpression).not.toContain('#f_version');
    expect(u.UpdateExpression).not.toContain('#f_PK');
    expect(u.ExpressionAttributeNames).toMatchObject({ '#f_pinned': 'pinned' });
  });
});
