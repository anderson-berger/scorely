import type { User } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import type { ReadOptions, UserRepository } from './user.repository';
import { createUserService } from './user.service';

const EMAIL = 'ana@example.com';
const winner: User = {
  id: '00000000-0000-4000-8000-000000000001',
  email: EMAIL,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Repo em que o `create` perde a corrida: o email já foi gravado por outro login. */
function racedRepo(visibleToConsistentRead: boolean) {
  const reads: (ReadOptions | undefined)[] = [];
  const repo: UserRepository = {
    get: async () => undefined,
    async getByEmail(_email, opts) {
      reads.push(opts);
      // A 1ª leitura (antes do create) não vê nada; depois, só a leitura consistente vê o vencedor.
      if (reads.length === 1) return undefined;
      return opts?.consistent && visibleToConsistentRead ? winner : undefined;
    },
    create: async () => false,
    update: async () => undefined,
  };
  return { repo, reads };
}

describe('findOrCreateByEmail', () => {
  it('perdeu a corrida: relê o vencedor com leitura consistente', async () => {
    const { repo, reads } = racedRepo(true);
    const result = await createUserService(repo).findOrCreateByEmail(EMAIL);
    expect(result).toEqual({ user: winner, created: false });
    expect(reads[1]).toEqual({ consistent: true });
  });

  it('vencedor sumiu: USER_CREATE_CONFLICT (409), sem o email na mensagem', async () => {
    const { repo } = racedRepo(false);
    const err = await createUserService(repo)
      .findOrCreateByEmail(EMAIL)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'USER_CREATE_CONFLICT', status: 409 });
    expect((err as Error).message).not.toContain(EMAIL);
  });
});
