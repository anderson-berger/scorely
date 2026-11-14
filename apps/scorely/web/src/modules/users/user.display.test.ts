import { type Me, PublicUserIdSchema } from '@scorely/contracts';
import { displayName } from '@scorely/web/src/modules/users/user.display';
import { describe, expect, it } from 'vitest';

// USR-04 (docs/modules/usuarios.md): o nome mostrado é sempre o apelido, para os outros e para a própria pessoa.

const ME = {
  id: PublicUserIdSchema.parse('7K3QX9TA'),
  createdAt: '2026-01-01T00:00:00.000Z',
  email: 'ana@example.com',
  preferences: {},
};

describe('nome mostrado (USR-04)', () => {
  it('USR-04: mostra o apelido, mesmo com o nome preenchido', () => {
    const me: Me = { ...ME, name: 'Ana Souza', nickname: 'Aninha' };
    expect(displayName(me)).toBe('Aninha');
  });

  it('USR-04: conta nova mostra o apelido inicial (o código, USR-02), nunca o email', () => {
    const shown = displayName({ ...ME, nickname: ME.id });
    expect(shown).toBe('7K3QX9TA');
    expect(shown).not.toBe(ME.email);
  });
});
