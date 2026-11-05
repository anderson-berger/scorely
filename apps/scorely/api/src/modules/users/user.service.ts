import type { UpdateMeInput, User } from '@scorely/contracts';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import type { UserRepository } from './user.repository';

export function createUserService(repo: UserRepository, now: () => Date = () => new Date()) {
  return {
    async get(id: string): Promise<User> {
      const user = await repo.get(id);
      if (!user) throw appError('USER_NOT_FOUND');
      return user;
    },

    /**
     * Acha o usuário pelo email (já normalizado) ou cria um novo.
     * Se dois logins simultâneos tentarem criar o mesmo email, o perdedor relê o vencedor.
     */
    async findOrCreateByEmail(email: string): Promise<{ user: User; created: boolean }> {
      const existing = await repo.getByEmail(email);
      if (existing) return { user: existing, created: false };
      const user = newEntity<User>({ email }, now());
      if (await repo.create(user)) return { user, created: true };
      // Outro login criou o mesmo email ao mesmo tempo: relê o vencedor com leitura consistente,
      // senão a leitura eventual pode ainda não enxergar o item recém-gravado.
      const winner = await repo.getByEmail(email, { consistent: true });
      if (!winner) throw appError('USER_CREATE_CONFLICT');
      return { user: winner, created: false };
    },

    async update(id: string, patch: UpdateMeInput): Promise<User> {
      const user = await repo.update(id, patch);
      if (!user) throw appError('USER_NOT_FOUND');
      return user;
    },
  };
}
export type UserService = ReturnType<typeof createUserService>;
