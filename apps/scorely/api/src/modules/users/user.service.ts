import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { MediaTarget } from '@scorely/api/src/modules/media/media.table';
import type { UserRepository } from '@scorely/api/src/modules/users/user.repository';
import { userKey } from '@scorely/api/src/modules/users/user.table';
import type {
  AttachMediaInput,
  Me,
  MediaUpload,
  MediaUploadInput,
  Preferences,
  UpdateMeInput,
  User,
} from '@scorely/contracts';

/** O perfil como fica no banco: `avatarMediaId` é interno (USR-08) e não sai na resposta. */
type StoredUser = User & { avatarMediaId?: string };

function publicMe(me: Me): Me {
  const { avatarMediaId: _media, ...rest } = me as Me & { avatarMediaId?: string };
  return rest;
}

export function createUserService(
  repo: UserRepository,
  now: () => Date = () => new Date(),
  media: MediaService = mediaService,
) {
  /** A própria pessoa: perfil, email e preferências (USR-13, 14). */
  async function get(id: string): Promise<Me> {
    const me = await repo.getMe(id);
    if (!me) throw appError('USER_NOT_FOUND');
    return publicMe(me);
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
    async findOrCreateByEmail(email: string): Promise<{ user: Me; created: boolean }> {
      const existing = await repo.getByEmail(email);
      if (existing) return { user: publicMe(existing), created: false };
      // USR-13: o email vai à parte, nunca no perfil.
      const user = newEntity<User>({}, now());
      if (await repo.create(user, email)) return { user: { ...user, email, preferences: {} }, created: true };
      // Outro login criou o mesmo email ao mesmo tempo: relê o vencedor com leitura consistente,
      // senão a leitura eventual pode ainda não enxergar o item recém-gravado.
      const winner = await repo.getByEmail(email, { consistent: true });
      if (!winner) throw appError('USER_CREATE_CONFLICT');
      return { user: publicMe(winner), created: false };
    },

    /** USR-03: cada campo vai para a sua parte (perfil ou preferências); devolve a pessoa com as preferências (USR-14). */
    async update(id: string, patch: UpdateMeInput): Promise<Me> {
      const me = await repo.update(id, patch);
      if (!me) throw appError('USER_NOT_FOUND');
      return publicMe(me);
    },

    /** Preferências atuais (USR-14): o refresh devolve junto com os tokens. */
    preferences: (id: string): Promise<Preferences> => repo.getPreferences(id),

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
    async setAvatar(userId: string, input: AttachMediaInput): Promise<Me> {
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
    async clearAvatar(userId: string): Promise<Me> {
      await get(userId);
      await media.detach({ purpose: 'avatar', ownerId: userId, target: avatarTarget(userId) });
      return get(userId);
    },
  };
}
export type UserService = ReturnType<typeof createUserService>;
