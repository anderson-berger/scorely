import type {
  AttachMediaInput,
  MediaUpload,
  MediaUploadInput,
  UpdateMeInput,
  User,
} from '@scorely/contracts';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import { type MediaService, mediaService } from '../media/media.service';
import type { MediaTarget } from '../media/media.table';
import type { UserRepository } from './user.repository';
import { userKey } from './user.table';

/** O usuário como fica no banco: `avatarMediaId` é interno (USR-08) e não sai na resposta. */
type StoredUser = User & { avatarMediaId?: string };

function publicUser(user: StoredUser): User {
  const { avatarMediaId: _media, ...rest } = user;
  return rest;
}

export function createUserService(
  repo: UserRepository,
  now: () => Date = () => new Date(),
  media: MediaService = mediaService,
) {
  async function get(id: string): Promise<User> {
    const user = await repo.get(id);
    if (!user) throw appError('USER_NOT_FOUND');
    return publicUser(user);
  }

  /** Onde a foto da pessoa fica ligada (MID-08): `avatarMediaId`/`avatarUrl` no item dela. */
  function avatarTarget(userId: string): MediaTarget {
    return {
      key: userKey(userId),
      field: 'avatar',
      async readCurrent() {
        const user = (await repo.get(userId, { consistent: true })) as StoredUser | undefined;
        return user?.avatarMediaId;
      },
    };
  }

  return {
    get,

    /**
     * Acha o usuário pelo email (já normalizado) ou cria um novo.
     * Se dois logins simultâneos tentarem criar o mesmo email, o perdedor relê o vencedor.
     */
    async findOrCreateByEmail(email: string): Promise<{ user: User; created: boolean }> {
      const existing = await repo.getByEmail(email);
      if (existing) return { user: publicUser(existing), created: false };
      const user = newEntity<User>({ email }, now());
      if (await repo.create(user)) return { user, created: true };
      // Outro login criou o mesmo email ao mesmo tempo: relê o vencedor com leitura consistente,
      // senão a leitura eventual pode ainda não enxergar o item recém-gravado.
      const winner = await repo.getByEmail(email, { consistent: true });
      if (!winner) throw appError('USER_CREATE_CONFLICT');
      return { user: publicUser(winner), created: false };
    },

    async update(id: string, patch: UpdateMeInput): Promise<User> {
      const user = await repo.update(id, patch);
      if (!user) throw appError('USER_NOT_FOUND');
      return publicUser(user);
    },

    /** USR-08: só a própria pessoa pede o envio da foto (dona e quem envia). */
    async requestAvatarUpload(userId: string, input: MediaUploadInput): Promise<MediaUpload> {
      return media.requestUpload({
        purpose: 'avatar',
        ownerId: userId,
        uploadedBy: userId,
        contentType: input.contentType,
      });
    },

    /** USR-08: confirma a foto; a mídia confere, liga e apaga a anterior (MID-05 a MID-09). */
    async setAvatar(userId: string, input: AttachMediaInput): Promise<User> {
      await get(userId);
      await media.attach({
        mediaId: input.mediaId,
        purpose: 'avatar',
        ownerId: userId,
        target: avatarTarget(userId),
      });
      return get(userId);
    },

    /** USR-08: remove a foto (MID-10). Sem foto, devolve o usuário como está. */
    async clearAvatar(userId: string): Promise<User> {
      await get(userId);
      await media.detach({ purpose: 'avatar', ownerId: userId, target: avatarTarget(userId) });
      return get(userId);
    },
  };
}
export type UserService = ReturnType<typeof createUserService>;
