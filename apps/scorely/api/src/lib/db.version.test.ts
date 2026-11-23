import { expectVersion, versionConflict } from '@scorely/api/src/lib/db';
import { AppError } from '@scorely/api/src/lib/errors';
import { describe, expect, it } from 'vitest';

// ADR 0016 (docs/decisions/0016-version-confere-nas-edicoes.md): toda edição grava só se a `version` que a tela mostrou
// for a atual. `0` quer dizer que o item ainda não existe.

describe('expectVersion (ADR 0016)', () => {
  it('ADR 0016: com uma versão, a condição é a version igual à esperada', () => {
    const c = expectVersion(3);
    expect(c.ConditionExpression).toBe('version = :expectedVersion');
    expect(c.ExpressionAttributeValues).toEqual({ ':expectedVersion': 3 });
  });

  it('ADR 0016: com 0, a condição é o item não existir, sem valores', () => {
    const c = expectVersion(0);
    expect(c.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(Object.keys(c.ExpressionAttributeValues ?? {})).toEqual([]);
  });
});

describe('versionConflict (ADR 0016)', () => {
  it('ADR 0016: a falha vira VERSION_CONFLICT (409) com a versão atual relida', async () => {
    const reads: number[] = [];
    const err = await versionConflict(async () => {
      reads.push(1);
      return 7;
    });
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'VERSION_CONFLICT', status: 409, details: { currentVersion: 7 } });
    expect(reads).toHaveLength(1);
  });

  it('ADR 0016: item que sumiu volta como currentVersion 0', async () => {
    const err = await versionConflict(async () => 0);
    expect(err).toMatchObject({ code: 'VERSION_CONFLICT', status: 409, details: { currentVersion: 0 } });
  });
});
